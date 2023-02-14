import "mocha";
// import { expect } from "chai";
import { describe, it } from "node:test";
import { uploadFilesToBucket } from "../src/ss-pro";
// import { createWriteStream, existsSync } from 'node:fs';

describe("Upload to cloud storge", function () {
  describe("bucket upload", function () {
    it(`confirm bucket upload works`, async () => await testBucketUpload("test/screenshots/ios/out/locale", "sporthub-b983c.appspot.com", "test/screenshots"));
  });
});

async function testBucketUpload(path: string, bucket: string, bucketPath: string) {
  uploadFilesToBucket(path, bucket, bucketPath)
  .then(() => console.log("Files uploaded successfully"))
  .catch(err => console.error("Error uploading files", err));
}
