import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// Short-lived delivery ledger: hashes and status only, never the applicant's contact or message.
export const leadDelivery = sqliteTable("lead_delivery", {
  id: text("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  ipHash: text("ip_hash").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [uniqueIndex("delivery_fingerprint_unique").on(table.fingerprint), index("delivery_ip_created").on(table.ipHash, table.createdAt), index("delivery_expiry").on(table.expiresAt)]);
