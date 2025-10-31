import { expressjwt as jwt } from "express-jwt";
import jwksRsa from "jwks-rsa";

// Auth0 configuration
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "dev-dkdxpljfvflt1jgs.us.auth0.com";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || process.env.AUTH0_API_IDENTIFIER;

// JWT verification middleware configuration
const jwtOptions = {
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
  }),
  issuer: `https://${AUTH0_DOMAIN}/`,
  algorithms: ["RS256"],
};

// Only add audience if it's configured (optional for basic Auth0 tokens)
if (AUTH0_AUDIENCE) {
  jwtOptions.audience = AUTH0_AUDIENCE;
}

// Debug middleware to log token information
export const debugAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('\n=== Auth Debug ===');
  console.log('Method:', req.method);
  console.log('Original URL:', req.originalUrl);
  console.log('Path:', req.path);
  console.log('Base URL:', req.baseUrl);
  console.log('Authorization header present:', !!authHeader);
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '').trim();
    console.log('Token length:', token.length);
    
    try {
      // Decode without verification to inspect structure
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log('Token payload:', {
          sub: payload.sub,
          iss: payload.iss,
          aud: payload.aud || 'no audience',
          exp: new Date(payload.exp * 1000).toISOString(),
          iat: new Date(payload.iat * 1000).toISOString(),
          hasEmail: !!payload.email,
          hasName: !!payload.name
        });
      } else {
        console.log('Token is not a valid JWT (does not have 3 parts)');
      }
    } catch (e) {
      console.log('Token decode error:', e.message);
    }
  } else {
    console.log('No Authorization header found');
  }
  console.log('=================\n');
  next();
};

export const checkJwt = jwt({
  ...jwtOptions,
  requestProperty: 'user', // Store decoded token in req.user
  // Better error handling
  onError: (err, req, res, next) => {
    console.error('JWT verification error:', err.message);
    console.error('Error name:', err.name);
    if (err.inner) {
      console.error('Inner error:', err.inner.message);
    }
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: err.message,
    });
  }
}).unless({ path: ['/'] }); // Allow root path without auth

// Middleware to extract user info from token
export const attachUser = async (req, res, next) => {
  try {
    // Get decoded token from checkJwt middleware
    const decoded = req.user;
    
    if (!decoded) {
      console.log('req.user is undefined after checkJwt');
      return res.status(401).json({
        success: false,
        message: "Token verification failed",
      });
    }

    console.log('Token verified successfully');
    
    // Extract all available user info from token
    // Access tokens may not have user info, so check multiple possible claim locations
    let email = decoded.email;
    let name = decoded.name || decoded.given_name || decoded.nickname;
    let picture = decoded.picture;
    
    // If user info is missing, try to fetch from Auth0 userinfo endpoint
    if (!email || !name) {
      try {
        const token = req.headers.authorization?.replace('Bearer ', '').trim();
        if (token) {
          const userinfoResponse = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (userinfoResponse.ok) {
            const userinfo = await userinfoResponse.json();
            console.log('Fetched userinfo from Auth0:', {
              email: userinfo.email || 'not in userinfo',
              name: userinfo.name || userinfo.given_name || 'not in userinfo'
            });
            email = email || userinfo.email;
            name = name || userinfo.name || userinfo.given_name || userinfo.nickname;
            picture = picture || userinfo.picture;
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch userinfo from Auth0:', err.message);
      }
    }
    
    // Log all available claims for debugging
    console.log('Available token claims:', Object.keys(decoded).filter(key => 
      !['iss', 'sub', 'aud', 'iat', 'exp', 'nonce', 'sid', 'azp'].includes(key)
    ));
    
    console.log('Final user info:', {
      sub: decoded.sub,
      email: email || 'not available',
      name: name || 'not available',
      picture: picture || 'not available',
      email_verified: decoded.email_verified || 'not in token'
    });
    
    // Attach user info to request
    req.auth0Id = decoded.sub; // Auth0 user ID (always present)
    req.userEmail = email || undefined;
    req.userName = name || undefined;
    req.userPicture = picture || undefined;
    
    next();
  } catch (error) {
    console.error('❌ Error in attachUser:', error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

// Combined middleware for protected routes
export const authenticate = [debugAuth, checkJwt, attachUser];

