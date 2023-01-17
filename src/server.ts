import express from 'express';
import child_process from 'child_process';
import dotenv from 'dotenv';

const app = express();
app.use(express.json());
dotenv.config({ path: ".env" });

const port = process.env.LISTEN_PORT;

const adbCommand = "adb exec-out screencap -p > {path}";
const iosPermsCommand = "applesimutils --booted --bundle {bundleId} --setPermissions \"{perms}\"";
const adbLocationSetCommand = 'adb emu geo fix {lng} {lat}';
const iosLocationSetCommand = 'applesimutils --booted -sl "[{lat}, {lng}]"';

interface Screenshot {
  path: string;
};

interface PermissionsRequest {
  perms: string;
  bundleId: string;
};

interface GpsPosition {
  lat: number;
  lng: number;
};

app.post('/android/screenshot', (req: express.Request, res: express.Response) => {
  try {
    const ssRequest: Screenshot = req.body;
    console.log(`Requested screenshot to ${ssRequest.path}`);
    const screenshotBasePath = process.env.SCREENSHOT_BASE_PATH;
    child_process.execSync(adbCommand.replace("{path}", `${screenshotBasePath}/${ssRequest.path}`));
    res.send();
  } catch (e) {
    console.error(e);
    res.status(500).send(`Error: ${e}`);
  }
});

app.post('/ios/permissions', (req: express.Request, res: express.Response) => {
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

app.post('/ios/location', (req: express.Request, res: express.Response) => {
  try {
    const requestData: GpsPosition = req.body;
    console.log(`Requested ios location [lat, lng] : [${requestData.lat}, ${requestData.lng}]`);
    child_process.execSync(iosLocationSetCommand
      .replace("{lat}", `${requestData.lat}`)
      .replace("{lng}", `${requestData.lng}`)
    );
    res.send();
  } catch (e) {
    console.error(e);
    res.status(500).send(`Error: ${e}`);
  }
});

app.post('/android/location', (req: express.Request, res: express.Response) => {
  try {
    const requestData: GpsPosition = req.body;
    console.log(`Requested ios location [lat, lng] : [${requestData.lat}, ${requestData.lng}]`);
    child_process.execSync(adbLocationSetCommand
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
