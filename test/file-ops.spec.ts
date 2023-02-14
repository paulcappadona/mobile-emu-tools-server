import "mocha";
import { expect } from "chai";
import { describe, it } from "node:test";
import { downloadFile } from "../src/ss-pro";
import { existsSync, rm } from 'node:fs';
import extract from 'extract-zip';

describe("Zip File Download & Extraction", function () {
  describe("Download", function () {
    it(`confirm file download works`, async () => await testFileDownload("https://storage.googleapis.com/sporthub-b983c.appspot.com/test/screenshots-pro.zip", "test/screenshots.zip"));
  });
});

async function testFileDownload(url: string, destination: string) {
  await downloadFile(url, destination);

  // confirm file exists
  const exists = existsSync(destination);
  expect(exists).to.be.true;

  let archiveParentDir : string | undefined;
  const outDir = "/Users/paulcappadona/dev/personal/adb-invocation-server/test/screenshots";
  await extract(destination, 
    {
      dir: outDir,
      onEntry(entry, zipfile) {
        // rename the files
        const filename = entry.fileName;
        // if the filename is an image (ends in png) then we want to rename it, otherwise ignore
        if (!filename.endsWith(".png")) {
          archiveParentDir ??= filename;
          return;
        }

        // filename wll be in the format {path}/{order}.png, we want to extract the order element
        const pathElements = filename.split("/");
        const name = pathElements[pathElements.length - 1].split(".")[0];
        console.log(`Entry filename: ${filename}, name: ${name}`);
        let filePattern = "ios/out/{locale}/{sequence}{name}_{device}.png";
        const newFilename = filePattern.replace("{platform}", "ios")
          .replace("{sequence}", "0")
          .replace("{name}", name)
          .replace("{locale}", "locale")
          .replace("{device}", "device");
        console.log(`Renaming ${filename} to ${newFilename}`);
        entry.fileName = newFilename;
      },
    })
    .then(() => console.log("Extraction complete"))
    .then(() => {
      if (archiveParentDir === undefined) return;
      // otherwise lets remove any archive direcotries that were created
      rm(`${outDir}/${archiveParentDir}`, { recursive: true, force: true },
        (err) => console.log(`Error removing archive directory ${archiveParentDir}: `, err));
    })
    .catch((err) => {
      console.error(`Error extracting ${destination} to ${outDir}`, err);
      throw err;
    });
}
