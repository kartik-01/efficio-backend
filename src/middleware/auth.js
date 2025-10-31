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

// Debug middleware to log token information (development only)
export const debugAuth = (req, res, next) => {
  if (process.env.NODE_ENV !== 'development') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }
  
  const token = authHeader.replace('Bearer ', '').trim();
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      console.log('Auth token:', {
        sub: payload.sub,
        aud: payload.aud,
        exp: new Date(payload.exp * 1000).toISOString()
      });
    }
  } catch (e) {
    // Ignore decode errors
  }
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
            email = email || userinfo.email;
            name = name || userinfo.name || userinfo.given_name || userinfo.nickname;
            picture = picture || userinfo.picture;
          }
        }
      } catch (err) {
        console.warn('Could not fetch userinfo from Auth0:', err.message);
      }
    }
    
    // Attach user info to request
    req.auth0Id = decoded.sub; // Auth0 user ID (always present)
    req.userEmail = email || undefined;
    req.userName = name || undefined;
    req.userPicture = picture || undefined;
    
    next();
  } catch (error) {
    console.error('Error in attachUser:', error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

// Combined middleware for protected routes
export const authenticate = [debugAuth, checkJwt, attachUser];

