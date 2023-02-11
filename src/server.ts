import express from 'express';
import child_process from 'child_process';
import dotenv from 'dotenv';
import { Platform, storeScreenshot } from './ss-pro';
import { mkdirSync } from 'fs';

const app = express();
app.use(express.json());
dotenv.config({ path: ".env" });

// setup any static paths we want to host
const staticPaths = process.env.STATIC_FILE_PATHS;
if (staticPaths) {
  staticPaths.split(",").forEach(path => {
    if (path.length === 0) return;
    console.log(`Hosting static files from ${path}`);
    app.use('/static', express.static(path));
  });
}

const port = process.env.LISTEN_PORT;

const adbCommand = "adb exec-out screencap -p > {path}";
const iosScreenshotCommand = "xcrun simctl io booted screenshot {path}";
const iosPermsCommand = "applesimutils --booted --bundle {bundleId} --setPermissions \"{perms}\"";
const adbLocationSetCommand = 'adb emu geo fix {lng} {lat}';
const iosLocationSetCommand = 'applesimutils --booted -sl "[{lat}, {lng}]"';

interface Screenshot {
  locale: string;
  device?: string;
  name: string;
};

interface PermissionsRequest {
  perms: string;
  bundleId: string;
};

interface GpsPosition {
  lat: number;
  lng: number;
};

app.post('/screenshot/:platform', (req: express.Request, res: express.Response) => {
  try {
    // convert platform to Platform enum
    const platform: Platform = req.params.platform as Platform;
    const ssRequest: Screenshot = req.body;
    const locale = ssRequest.locale;
    const device = ssRequest.device ?? "default";
    console.log(`Requested ${platform} screenshot ${ssRequest.name} for locale ${locale} and device ${device}`);
    const screenshotBasePath = process.env.SCREENSHOT_CAPTURE_PATH!;
    const path = screenshotBasePath?.replace("{platform}", platform).replace("{locale}", locale).replace("{device}", device);
    // if the filesystem path doesn't exist, create it
    mkdirSync(path, { recursive: true });
    let ssCommand = adbCommand;
    if (platform === Platform.IOS) {
      ssCommand = iosScreenshotCommand;
    }
    child_process.execSync(ssCommand.replace("{path}", `${path}/${ssRequest.name}`));
    res.send();
  } catch (e) {
    console.error(e);
    res.status(500).send(`Error: ${e}`);
  }
});

// sends a request to the screenshots pro server to generate screenshots
app.post('/store/screenshots', storeScreenshot);

app.post('/permissions/ios', (req: express.Request, res: express.Response) => {
  try {
    const requestData: PermissionsRequest = req.body;
    console.log(`Requested ios perms ${requestData.perms} to be set`);
    child_process.execSync(iosPermsCommand
      .replace("{perms}", `${requestData.perms}`)
      .replace("{bundleId}", `${requestData.bundleId}`)
    );
    res.send();
  } catch (e) {
    console.error(e);
    res.status(500).send(`Error: ${e}`);
  }
});

app.post('/location/:platform', (req: express.Request, res: express.Response) => {
  try {
    const platform = req.params.platform;
    const requestData: GpsPosition = req.body;
    console.log(`Requested ${platform} location [lat, lng] : [${requestData.lat}, ${requestData.lng}]`);
    let locCommand = adbLocationSetCommand;
    if (platform === Platform.IOS) {
      locCommand = iosLocationSetCommand;
    }
    child_process.execSync(locCommand
      .replace("{lat}", `${requestData.lat}`)
      .replace("{lng}", `${requestData.lng}`)
    );
    res.send();
  } catch (e) {
    console.error(e);
    res.status(500).send(`Error: ${e}`);
  }
});

app.listen(port, () => {
  console.log(`mobile emulator tools server listening on port ${port}`)
});
