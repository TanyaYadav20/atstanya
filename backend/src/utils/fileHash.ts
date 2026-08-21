import crypto from "crypto";
import fs from "fs";

export function generateFileHash(
  filePath: string
): string {
  const file = fs.readFileSync(filePath);

  return crypto
    .createHash("sha256")
    .update(file)
    .digest("hex");
}
