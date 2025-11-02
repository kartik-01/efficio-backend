import User from "../models/User.js";

/**
 * Clean up duplicate users - keep the most recently updated one for each auth0Id
 */
const cleanupDuplicateUsers = async () => {
  try {
    // Find all duplicate auth0Ids
    const duplicates = await User.aggregate([
      {
        $group: {
          _id: "$auth0Id",
          count: { $sum: 1 },
          docs: { $push: "$$ROOT" }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicates.length === 0) {
      console.log("✓ No duplicate users found");
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate auth0Id(s), cleaning up...`);

    for (const duplicate of duplicates) {
      const docs = duplicate.docs;
      
      // Sort by updatedAt (most recent first), then by createdAt if tied
      docs.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || new Date(0);
        const bTime = b.updatedAt || b.createdAt || new Date(0);
        if (bTime.getTime() !== aTime.getTime()) {
          return bTime.getTime() - aTime.getTime();
        }
        return (b.createdAt || new Date(0)).getTime() - (a.createdAt || new Date(0)).getTime();
      });

      // Keep the first (most recent) one, delete the rest
      const toKeep = docs[0];
      const toDelete = docs.slice(1);

      console.log(`  Keeping user ${toKeep._id} (most recent) for auth0Id: ${duplicate._id}`);
      
      for (const doc of toDelete) {
        await User.findByIdAndDelete(doc._id);
        console.log(`  Deleted duplicate user ${doc._id}`);
      }
    }

    console.log("✓ Duplicate users cleaned up");
  } catch (error) {
    console.error("Error cleaning up duplicate users:", error);
    throw error;
  }
};

/**
 * Ensure unique index exists on auth0Id field
 * This should be called on app startup to guarantee the index exists
 */
export const ensureUserIndexes = async () => {
  try {
    // First, check and clean up any duplicate users
    await cleanupDuplicateUsers();

    // Now try to create the unique index
    try {
      await User.collection.createIndex({ auth0Id: 1 }, { unique: true, background: true });
      console.log("✓ Unique index on auth0Id verified/created");
    } catch (indexError) {
      // If index creation fails due to duplicates, clean up and try again
      if (indexError.code === 11000 || indexError.codeName === 'DuplicateKey') {
        console.log("⚠️  Index creation failed due to duplicates, cleaning up and retrying...");
        await cleanupDuplicateUsers();
        // Try again
        await User.collection.createIndex({ auth0Id: 1 }, { unique: true, background: true });
        console.log("✓ Unique index on auth0Id created after cleanup");
      } else if (indexError.code === 85 || indexError.codeName === 'IndexOptionsConflict') {
        // Index already exists with different options
        console.log("✓ Index already exists (different options)");
      } else {
        throw indexError;
      }
    }
    
    // Ensure index on email for faster queries (non-unique)
    try {
      await User.collection.createIndex({ email: 1 }, { background: true });
      console.log("✓ Index on email verified/created");
    } catch (error) {
      // Ignore if already exists
      if (error.code !== 85 && error.codeName !== 'IndexOptionsConflict') {
        console.warn("Warning: Could not create email index:", error.message);
      }
    }
  } catch (error) {
    console.error("Error ensuring indexes:", error);
    // Don't throw - allow server to start even if index creation fails
    // The unique constraint in the schema should still work
  }
};

