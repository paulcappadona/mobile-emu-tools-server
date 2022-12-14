"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = __importDefault(require("child_process"));
const dotenv_1 = __importDefault(require("dotenv"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
const port = 3000;
const adbCommand = "adb exec-out screencap -p > {path}";
dotenv_1.default.config({ path: ".env" });
;
app.post('/', (req, res) => {
    try {
        const ssRequest = req.body;
        console.log(`Requested screenshot to ${ssRequest.path}`);
        const screenshotBasePath = process.env.SCREENSHOT_BASE_PATH;
        child_process_1.default.execSync(adbCommand.replace("{path}", `${screenshotBasePath}/${ssRequest.path}`));
        res.send();
    }
    catch (e) {
        console.error(e);
        res.status(500).send(`Error: ${e}`);
    }
});
app.listen(port, () => {
    console.log(`ADB server listening on port ${port}`);
});
