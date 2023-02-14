"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = __importDefault(require("child_process"));
const dotenv_1 = __importDefault(require("dotenv"));
const ss_pro_1 = require("./ss-pro");
const fs_1 = require("fs");
const app = (0, express_1.default)();
app.use(express_1.default.json());
dotenv_1.default.config({ path: ".env" });
// setup any static paths we want to host
const staticPaths = process.env.STATIC_FILE_PATHS;
if (staticPaths) {
    staticPaths.split(",").forEach(path => {
        if (path.length === 0)
            return;
        console.log(`Hosting static files from ${path}`);
        app.use('/static', express_1.default.static(path));
    });
}
const port = process.env.LISTEN_PORT;
const adbCommand = "adb exec-out screencap -p > {path}";
const iosScreenshotCommand = "xcrun simctl io booted screenshot {path}";
const iosPermsCommand = "applesimutils --booted --bundle {bundleId} --setPermissions \"{perms}\"";
const adbLocationSetCommand = 'adb emu geo fix {lng} {lat}';
const iosLocationSetCommand = 'applesimutils --booted -sl "[{lat}, {lng}]"';
;
;
;
app.post('/screenshot/:platform', (req, res) => {
    var _a;
    try {
        // convert platform to Platform enum
        const platform = req.params.platform;
        const ssRequest = req.body;
        const locale = ssRequest.locale;
        const device = (_a = ssRequest.device) !== null && _a !== void 0 ? _a : "default";
        console.log(`Requested ${platform} screenshot ${ssRequest.name} for locale ${locale} and device ${device}`);
        const screenshotBasePath = process.env.SCREENSHOT_CAPTURE_PATH;
        const path = screenshotBasePath === null || screenshotBasePath === void 0 ? void 0 : screenshotBasePath.replace("{platform}", platform).replace("{locale}", locale).replace("{device}", device);
        // if the filesystem path doesn't exist, create it
        (0, fs_1.mkdirSync)(path, { recursive: true });
        let ssCommand = adbCommand;
        if (platform === ss_pro_1.Platform.IOS) {
            ssCommand = iosScreenshotCommand;
        }
        child_process_1.default.execSync(ssCommand.replace("{path}", `${path}/${ssRequest.name}`));
        res.send();
    }
    catch (e) {
        console.error(e);
        res.status(500).send(`Error: ${e}`);
    }
});
// sends a request to the screenshots pro server to generate screenshots
app.post('/store/screenshots', ss_pro_1.storeScreenshot);
app.get('/store/screenshots/status', ss_pro_1.storeScreenshotStatus);
app.post('/permissions/ios', (req, res) => {
    try {
        const requestData = req.body;
        console.log(`Requested ios perms ${requestData.perms} to be set`);
        child_process_1.default.execSync(iosPermsCommand
            .replace("{perms}", `${requestData.perms}`)
            .replace("{bundleId}", `${requestData.bundleId}`));
        res.send();
    }
    catch (e) {
        console.error(e);
        res.status(500).send(`Error: ${e}`);
    }
});
app.post('/location/:platform', (req, res) => {
    try {
        const platform = req.params.platform;
        const requestData = req.body;
        console.log(`Requested ${platform} location [lat, lng] : [${requestData.lat}, ${requestData.lng}]`);
        let locCommand = adbLocationSetCommand;
        if (platform === ss_pro_1.Platform.IOS) {
            locCommand = iosLocationSetCommand;
        }
        child_process_1.default.execSync(locCommand
            .replace("{lat}", `${requestData.lat}`)
            .replace("{lng}", `${requestData.lng}`));
        res.send();
    }
    catch (e) {
        console.error(e);
        res.status(500).send(`Error: ${e}`);
    }
});
app.listen(port, () => {
    console.log(`mobile emulator tools server listening on port ${port}`);
});
