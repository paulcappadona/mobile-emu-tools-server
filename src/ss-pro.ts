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
import {createWriteStream, readdirSync, rm } from 'node:fs';
import fetch from 'node-fetch';
import extract from 'extract-zip';

const AndroidScreenshotPattern = "{platform}/fastlane/metadata/android/{locale}/images/phoneScreenshots/{sequence}{name}";
const IosScreenshotPattern = "{platform}/fastlane/screenshots/{locale}/{sequence}{name}_{device}.png";

const storage = new googlestorage.Storage();

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
  const host = process.env.SSPRO_API_HOST!;
  const endpoint = process.env.SSPRO_API_ENDPOINT!;
  const token = process.env.SSPRO_API_KEY!;
  const downloadUrls: string[] = [];

  const templateGenPromises = templateUpdates.map((template) => {
    const imagesBucketPath = process.env.GCLOUD_STORAGE_SS_BASE_PATH!.replace("{platform}", template.platform)
      .replace("{locale}", template.locale)
      .replace("{device}", template.device);

      // we need to build a list of modifications
    const modifications: Modification[] = [];
    template.screens.map((screen) => {
      modifications.push(...Modification.fromScreenMeta(imagesBucketPath, screen));
    });

    console.log(`Submitting request for template ${template.id} (${template.platform} / ${template.locale} / ${template.device})`);
    return fetch(endpoint.replace("{template_id}", template.id), {
        method: 'POST',
        headers: {
          'Bearer': token,
        },
        body: JSON.stringify(modifications),
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
      });
    });

  return Promise.all(templateGenPromises);
}

// download the archive from supplied url
async function downloadScreenshots(url: string, templateUpdate: TemplateUpdate) {
  // download a zip file from the url
  let outDir = process.env.IOS_SCREENSHOT_OUTPUT_BASE_PATH!;
  if (templateUpdate.platform === Platform.Android) {
    outDir = process.env.ANDROID_SCREENSHOT_OUTPUT_BASE_PATH!;
  }
  outDir = outDir.replace("{platform}", templateUpdate.platform)
    .replace("{sequence}", `${templateUpdate.sequence}`)
    .replace("{locale}", templateUpdate.locale)
    .replace("{device}", templateUpdate.device);

  const destination = `${outDir}/${templateUpdate.sequence}.zip`;
  try {
    await downloadFile(url, destination);

    let archiveParentDir : string | undefined;
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
        // otherwise lets remove any archive direcotries that were created
        rm(`${outDir}/${archiveParentDir}`, { recursive: true, force: true },
          (err) => console.log(`Error removing archive directory ${archiveParentDir}: `, err));
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
  return await new Promise(fulfill => fileStream.on("finish", fulfill));
}
