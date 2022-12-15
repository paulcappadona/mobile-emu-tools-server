# ADB Invocation Server
This is a small node server to be run on the host machine executing an mobile integration tests.

It supports the features I found troublesome to get working reliably (or at all) with Flutter and currently
available tools.

- Android Screenshots: The tools provide an endpoint (/android/screenshot) to take a screenshot of the
  device and save it to the host machine.  This was due to limitations with flutter drivers being able to
  capture screenshots on Android when using the Google Maps widget.
- IOS Permissions: The tools provide an endpoint (/ios/permissions) to set the permissions of the app
  on the device (using [applesimutils](https://github.com/wix/AppleSimulatorUtils).  This was born due to
  the ios simulator not being able to accept setting of permissions on a newly booted emulator for each integration
  test run.  This can be invoked directly from your integration test script (after the app has been installed, which
  seems to be why the command line tools kept producing onconsistent results).
## Requirements
1. NodeJS
2. ADB

## Development
1. Build the distribution code: `npm run build`
2. Run the server: `npm run start`
3. Debug mode: `npm run dev`

## Deployment
1. Install nodejs
2. Install dependencies: `npm install`
3. Run the server: `node server.js`

## Configuration
The server can be configured via the following environment variables in .env

## Usage
Call the service as follows from your integration test

### Android Screenshots
```dart
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  await http.post(Uri.parse("http://
```dart
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  await http.post(Uri.parse("http://10.0.2.2:3000/android/screenshot"), headers: headers,
    body: jsonEncode({ "path": "screenshots/$name.png"})
  ).then((resp) {
    if(resp.statusCode == 200) {
      print("Screenshot $name saved");
    } else {
      print("Screenshot $name failed");
    }
  }).catchError((err) => print("Error capturing screenshot for $name: ${err}"));
```
Note android treats 10.0.2.2 as localhost, so this is the IP you need to hit from within your device for localhost.

The path specified is appened to the SCREENSHOT_BASE_PATH environment variable.

### IOS Permissions
```dart
  print("Sending request to set permissions on ios device");
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  await http.post(Uri.parse("http://localhost:3000/ios/permissions"), headers: headers,
      body: jsonEncode({ "perms": "location=always", "bundleId": "<bundleId>" })
  ).then((resp) {
    if(resp.statusCode == 200) {
      print("Permissions set");
    } else {
      print("Settings permissions failed with code ${resp.statusCode}: ${resp.body}");
    }
  }).catchError((err) => print("Error sending request to set ios permissions: ${err}"));
```