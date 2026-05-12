interface TemplateUpdate {
  id: string;
  platform: Platform;
  // The sequence number of the template
  // We will prefix this to the returned sequence number of screenshot to keep them in order 
  sequence: number;
  // Specifically for ios, as we need multiple sets of screenshots (eg IPHONE_14_PRO_MAX)
  // This will be used in the resulting file name {Sequence}{DownloadedName}_{DeviceName}.png
  device: string;
  locale: string;
  screens: ScreenMeta[];
  // The path to the result output directory
  // This will be appended to the respective platform path [IOS|ANDROID]_SCREENSHOT_OUTPUT_BASE_PATH
  outDir?: string;
  // Override of file names that we will output from the template archive (in order)
  // Blank entries will default to the env variable OUTPUT_FILE_PATTERN
  outFiles?: string[];
}

interface ScreenMeta {
  // the screen number within the template
  number: number;
  heading?: string;
  blurb?: string;
  // List of URL's in sequence
  images: string[];
}

enum MetaTypes {
  Heading = "heading",
  Blurb = "blurb",
  Image = "image"
}

enum MetaAttributes {
  Text = "text",
  Screenshot = "screenshot",
}

export enum Platform {
  Android = "android",
  IOS = "ios",
}

// This is the modification format for screenshots pro
class Modification {
  name: string;
  attribute: string;
  value: string;

  constructor(name: string, attribute: string, value: string) {
    this.name = name;
    this.attribute = attribute;
    this.value = value;
  }

  static fromScreenMeta(imagePath: string, screen: ScreenMeta): Modification[] {
    const mods: Modification[] = [];
    if (screen.heading) {
      mods.push(new Modification(Modification.elementName(screen.number, MetaTypes.Heading), MetaAttributes.Text, screen.heading));
    }
    if (screen.blurb) {
      mods.push(new Modification(Modification.elementName(screen.number, MetaTypes.Blurb), MetaAttributes.Text, screen.blurb));
    }
    // now add image updates (which will match the names of images uploaded to the bucket)
    // we need to public URL for the image
    const publicUrlPath = `https://storage.googleapis.com/${process.env.GCLOUD_STORAGE_BUCKET}/${imagePath}`;
    // if we have a single image, the reference is in the form of s1.image
    // otherwise the file name is s1.image1, s1.image2 etc
    if (screen.images.length === 1) {
      mods.push(new Modification(Modification.elementName(screen.number, MetaTypes.Image), MetaAttributes.Screenshot, `${publicUrlPath}/${screen.images[0]}`));
    } else {
      for (let i = 0; i < screen.images.length; i++) {
        mods.push(new Modification(Modification.elementName(screen.number, MetaTypes.Image, i + 1), MetaAttributes.Screenshot, `${publicUrlPath}/${screen.images[i]}`));
      }
    }
    // console.debug(`Generated ${mods.length} modifications for screen ${screen.number} : ${JSON.stringify(mods)}`);
    return mods;
  }

  static elementName(screenNumber: number, elementType: MetaTypes, elementNumber?: number) {
    const name = `s${screenNumber}.${elementType}`;
    if (elementNumber) {
      return `${name}${elementNumber}`;
    }
    return name;
  }
}

interface ScreenshotProCreateResponse {
  id: string;
  download_url: string;
  status: string;
  created_at: string;
  started_at: string;
  detail: ResponseDetail[];
}

interface ResponseDetail {
  loc: string[];
  msg: string;
  type: string;
}

import express from 'express';
import * as googlestorage from '@google-cloud/storage';
import {createWriteStream, existsSync, mkdirSync, readdirSync, rm } from 'node:fs';
import fetch from 'node-fetch';
import extract from 'extract-zip';

const storage = new googlestorage.Storage();

// a count of the active requests to generate screenshots (as these are long running)
let screenshotGenerationCount = 0;

export const storeScreenshotStatus = async function (req: express.Request, res: express.Response) {
  res.status(200).send({ active: screenshotGenerationCount });
  return;
}

// we need an express function to take a list of images, upload to a publicly accessible
// location, and then send a request with modification details to the server
export const storeScreenshot = async function (req: express.Request, res: express.Response) {
  // lets proocess the request data
  const templateUpdates: [TemplateUpdate] = req.body;
  console.log(`Requested generation of screenshots for ${templateUpdates.length} templates`);

  let platform: Platform | undefined;
  let locale: string | undefined;
  let device: string | undefined;

  for (const templateUpdate of templateUpdates) {
    if (platform === templateUpdate.platform &&
      locale === templateUpdate.locale &&
      device === templateUpdate.device) continue;
    
    platform = templateUpdate.platform;
    locale = templateUpdate.locale;
    device = templateUpdate.device;

    console.log(`Requested generation of screenshots for ${templateUpdate.platform} for template ${templateUpdate.id} for locale ${templateUpdate.locale}`);
    // we need to upload the images to a publicly accessible location

    // SCREENSHOT_CAPTURE_PATH="/screenshots/{platform}/{locale}/{device}"
    const filePattern = process.env.SCREENSHOT_CAPTURE_PATH;
    const filePath = filePattern!.replace("{platform}", platform)
      .replace("{locale}", locale)
      .replace("{device}", device);
    const bucketPath = process.env.GCLOUD_STORAGE_SS_BASE_PATH!.replace("{platform}", platform)
      .replace("{locale}", locale)
      .replace("{device}", device);

    // we need to upload the images to a publicly accessible location
    await uploadFilesToBucket(filePath, process.env.GCLOUD_STORAGE_BUCKET!, bucketPath)
      .then(() => console.log("Files uploaded successfully"))
      .catch((err) => {
        console.error(`Error uploading device images to bucket ${process.env.GCLOUD_STORAGE_BUCKET}/${bucketPath}`, err)
        res.status(500).send(`Error uploading device images to bucket ${process.env.GCLOUD_STORAGE_BUCKET}/${bucketPath}`);
        return;
      });
  }

  // lets submit a request to the screenshots server to generate the screenshots
  await submitScreenshotRequest(templateUpdates)
    .then(() => {
      console.log("Screenshot request submitted successfully");
      res.status(200).send("Screenshot request submitted successfully");
      return;
    })
    .catch((err) => {
      console.error("Error submitting screenshot request", err);
      res.status(500).send("Error submitting screenshot request");
      return;
    });
}

export async function uploadFilesToBucket(filePath: string, bucketName: string, destinationFolder: string) {
  // get a list of files in the folder
  const files : string[] = [];
  readdirSync(filePath).forEach((file) => {
    // if we have a png file, then add it to the list
    if (!file.endsWith(".png")) return;
    console.debug(`Adding file ${file} to upload list`);
    files.push(file);
  });

  const bucket = storage.bucket(bucketName);
  const promises: Promise<any>[] = [];

  files.forEach(file => {
    const destination = `${destinationFolder}/${file}`;
    promises.push(bucket.upload(`${filePath}/${file}`,
    {
      destination: destination,
      public: true,
      metadata: {
        cacheControl: 'public, max-age=3600',
      },
    }).then((resp) => {
      if (resp[1].error?.code ?? 200 > 399) {
        // we have an error
        console.error(`Error uploading file ${file} to bucket ${bucketName} : ${resp[1].error.code}:${resp[1].error.message}`, resp[1].error);
        throw new Error(`Error uploading file ${file} to bucket ${bucketName} : ${resp[1].error.code}:${resp[1].error.message}`);
      }
      console.log(`File ${file} uploaded to bucket ${bucketName} as ${destination}`);
    })
    );
  });
  return Promise.all(promises);
}

async function submitScreenshotRequest(templateUpdates: TemplateUpdate[]) {
  const endpoint = process.env.SSPRO_API_ENDPOINT!;
  const token = process.env.SSPRO_API_KEY!;
  const downloadUrls: string[] = [];

  // we want to batch up the requests to the server, 2 at a time, otherwise we'll run into rate limits
  // lets split templateUpdates into batches of 2
  const templateBatches: TemplateUpdate[][] = [];
  let batch: TemplateUpdate[] = [];
  for (const template of templateUpdates) {
    batch.push(template);
    if (batch.length === 2) {
      templateBatches.push(batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    templateBatches.push(batch);
  }

  console.log(`Submitting ${templateBatches.length} batches of requests to ${endpoint}`);
  let batchNumber = 1;
  const submissionPromises: Promise<any>[] = [];
  for (const batch of templateBatches) {
    console.log(`Submitting batch ${batchNumber} of ${templateBatches.length}`);
    const templateGenPromises = batch.map(async (template) => {
      screenshotGenerationCount++;
      const imagesBucketPath = process.env.GCLOUD_STORAGE_SS_BASE_PATH!.replace("{platform}", template.platform)
        .replace("{locale}", template.locale)
        .replace("{device}", template.device);

        // we need to build a list of modifications
      const modifications: Modification[] = [];
      template.screens.map((screen) => {
        modifications.push(...Modification.fromScreenMeta(imagesBucketPath, screen));
      });

      const apiUrl = endpoint.replace("{template_id}", template.id);
      console.log(`Submitting request for template ${template.id} (${template.platform} / ${template.locale} / ${template.device})`);
      const reqBody = { modifications: modifications };
      console.debug("--------------------");
      console.debug(`Request body : ${JSON.stringify(reqBody)}`);
      console.debug("--------------------");
      return fetch(apiUrl, {
          method: 'post',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqBody),
        })
        .then((response) => {
          if (!response.ok) {
            console.log(`Response from server for template ${template.id} (${template.platform} / ${template.locale} / ${template.device}) :`, response);
            // sometimes we see random generation errors, so we'll retry the request
            if (response.status < 500) {
              throw new Error(`Generating screenshots for template ${template.id} (${template.platform} / ${template.locale} / ${template.device}) : ${response.status} ${response.statusText}`);
            } else {
              console.log(`Retrying request for template ${template.id} (${template.platform} / ${template.locale} / ${template.device})`);
              return fetch(apiUrl, {
                method: 'post',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(reqBody),
              });
            }
          }
          return response;
        })
        .then((response) => {
          if (!response.ok) {
            console.log(`Response from server for template ${template.id} (${template.platform} / ${template.locale} / ${template.device}) :`, response);
            throw new Error(`Generating screenshots for template ${template.id} (${template.platform} / ${template.locale} / ${template.device}) : ${response.status} ${response.statusText}`);
          }
          return response.json() as any;
        })
        .then(async (data: ScreenshotProCreateResponse) =>{
          console.log(`Success generating screenshots for template ${template.id} (${template.platform} / ${template.locale} / ${template.device}) :`, data);
          if (data.download_url !== undefined) {
            downloadUrls.push(data.download_url);
            // lets get the generated screenshots and extract them to the correct location
            return await downloadScreenshots(data.download_url, template);
          }
        })
        .finally(() => screenshotGenerationCount--);
      });

    const batchPromises = Promise.all(templateGenPromises);
    submissionPromises.push(batchPromises);
    // wait for the batch to finish processing before sending next batch
    console.log(`Waiting for batch ${batchNumber} of ${templateBatches.length} to finish processing...`);
    await batchPromises.catch((err) => {
      console.error(`Error processing batch : ${err}`);
    });
    console.log(`Batch ${batchNumber} of ${templateBatches.length} complete`);
    batchNumber++;
  }

  return submissionPromises;
}

// download the archive from supplied url
async function downloadScreenshots(url: string, templateUpdate: TemplateUpdate) {
  // download a zip file from the url
  let outDir = process.env.IOS_SCREENSHOT_OUTPUT_BASE_PATH!;
  if (templateUpdate.platform === Platform.Android) {
    outDir = process.env.ANDROID_SCREENSHOT_OUTPUT_BASE_PATH!;
  }

  // console.debug(`Processing template update with outDir [${templateUpdate.outDir}]`);
  // console.debug("--------------------");
  // console.debug(`${JSON.stringify(templateUpdate)}`);
  // console.debug("--------------------");
  if ((templateUpdate.outDir?.length ?? 0) > 0) {
    // append the outDir to the base path
    console.debug(`Appending outDir ${templateUpdate.outDir} to base path ${outDir}`);
    outDir = `${outDir}/${templateUpdate.outDir}`;
  }

  outDir = outDir.replace("{platform}", templateUpdate.platform)
    .replace("{sequence}", `${templateUpdate.sequence}`)
    .replace("{locale}", templateUpdate.locale)
    .replace("{device}", templateUpdate.device);

  const destination = `${outDir}/${templateUpdate.sequence}.zip`;
  try {
    // create the output directory if it doesn't exist
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    await downloadFile(url, destination);

    let archiveParentDir : string | undefined;
    let fileCounter = 0;
    // extract the files
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
          let filePattern = process.env.OUTPUT_FILE_PATTERN!;
          if ((templateUpdate.outFiles?.length ?? 0) > 0) {
            if ((templateUpdate.outFiles?.length ?? 0) < fileCounter) {
              throw new Error(`Not enough output file patterns supplied in template update, failed processing file ${fileCounter + 1 }
               with name ${name}, but only ${templateUpdate.outFiles?.length ?? 0} patterns supplied`);
            }
            // lets substitute the file pattern with the one from the template
            filePattern = templateUpdate.outFiles![fileCounter++];
          }
          const newFilename = filePattern.replace("{platform}", templateUpdate.platform)
            .replace("{sequence}", `${templateUpdate.sequence}`)
            .replace("{name}", name)
            .replace("{locale}", templateUpdate.locale)
            .replace("{device}", templateUpdate.device);
          console.log(`Renaming ${filename} to ${newFilename}`);
          entry.fileName = newFilename;
        },
      })
      .then(() => console.log("Extraction complete"))
      .then(() => {
        if (archiveParentDir === undefined) return;
        // otherwise lets remove any archive directories that were created
        rm(`${outDir}/${archiveParentDir}`, { recursive: true, force: true },
          (err) => {
            if (err) console.log(`Error removing archive directory ${archiveParentDir}: `, err);
          });
        // lets also remove the zip archive
        rm(destination, { recursive: true, force: true },
          (err) => {
            if (err) console.log(`Error removing archive ${destination}: `, err);
          });
      })
      .catch((err) => {
        console.error(`Error extracting ${destination} to ${outDir}`, err);
        throw err;
      });
  } catch (err) {
    console.error(`Error processing generated screenshots ${url}`, err);
    throw err;
  }
}

export async function downloadFile(url: string, destination: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`unexpected response ${response.statusText}`);

  const fileStream = createWriteStream(destination);
  response.body?.pipe(fileStream);
  return new Promise(fulfill => fileStream.on("finish", fulfill));
}
