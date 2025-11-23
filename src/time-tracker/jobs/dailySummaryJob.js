import cron from "node-cron";
import User from "../../models/User.js";
import { calculateAndStoreSummary } from "../controllers/dailySummaryController.js";

/**
 * Scheduled job that runs at 11:59 PM every day to calculate and store
 * daily summaries for all active users
 */
export const startDailySummaryJob = () => {
  // Run at 11:59 PM every day
  // Cron format: minute hour day month dayOfWeek
  // "59 23 * * *" = 11:59 PM every day
  cron.schedule("59 23 * * *", async () => {
    console.log("[Daily Summary Job] Starting daily summary calculation at 11:59 PM...");
    
    try {
      // Get all active users
      const users = await User.find({ isActive: true }).select("auth0Id").lean();
      console.log(`[Daily Summary Job] Found ${users.length} active users`);

      // Get today's date (we're running at 11:59 PM, summarizing the day that's ending)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD format

      console.log(`[Daily Summary Job] Calculating summaries for date: ${dateStr}`);

      // Calculate and store summary for each user
      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          await calculateAndStoreSummary(user.auth0Id, dateStr);
          successCount++;
        } catch (error) {
          console.error(
            `[Daily Summary Job] Error calculating summary for user ${user.auth0Id}:`,
            error.message
          );
          errorCount++;
        }
      }

      console.log(
        `[Daily Summary Job] Completed: ${successCount} successful, ${errorCount} errors`
      );
    } catch (error) {
      console.error("[Daily Summary Job] Fatal error:", error);
    }
  });

  console.log("[Daily Summary Job] Scheduled job initialized (runs daily at 11:59 PM)");
};

