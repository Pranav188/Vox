import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getDb } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const citizensPath = join(__dirname, "citizens.json");
const citizens = JSON.parse(readFileSync(citizensPath, "utf-8"));

const db = getDb();

const insert = db.prepare(`
  INSERT OR IGNORE INTO citizens (aadhaar_id, full_name, date_of_birth, gender, district)
  VALUES (@aadhaar_id, @full_name, @date_of_birth, @gender, @district)
`);

const insertMany = db.transaction((records) => {
  for (const record of records) {
    insert.run(record);
  }
});

insertMany(citizens);

const count = db.prepare("SELECT COUNT(*) as total FROM citizens").get();
console.log(`Seeded ${count.total} citizen records into server.db`);
