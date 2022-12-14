import express from 'express';
import child_process from 'child_process';
import dotenv from 'dotenv';

const app = express();
app.use(express.json());
const port = process.env.LISTEN_PORT;

const adbCommand = "adb exec-out screencap -p > {path}";

dotenv.config({ path: ".env" });

interface Screenshot {
  path: string;
};

app.post('/', (req: express.Request, res: express.Response) => {
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
})

app.listen(port, () => {
  console.log(`ADB server listening on port ${port}`)
})
