# ADB Invocation Server
This is a small node server to be run on the host machine executing an mobile integration tests.

It supports the features I found troublesome to get working reliably (or at all) with Flutter and currently
available tools.

- Screenshots: The tools provide an endpoint (/screenshot{platform}) to take a screenshot of the
device and save it to the host machine.  This was due to limitations with flutter drivers being able to
capture screenshots on Android when using the Google Maps widget.
- IOS Permissions: The tools provide an endpoint (/ios/permissions) to set the permissions of the app
on the device (using [applesimutils](https://github.com/wix/AppleSimulatorUtils).  This was born due to
the ios simulator not being able to accept setting of permissions on a newly booted emulator for each integration test run.  This can be invoked directly from your integration test script (after the app has been installed, which seems to be why the command line tools kept producing onconsistent results).
- GPS Location: The tools provide an endpoint (/location/{platform}) to set the location of the device
- Deeplinks: The tools provide an endpoint (/deeplink/{platform}) to send a deeplink to the device
- Static file serve - You can mount a directory to the server and serve static files from it. This is useful if  you need to expose any local stored files to your integration tests (they can be pulled via a http request to the device)

### Screenshots Pro
The server also includes integration to https://screenshots.pro/ to generate app screenshots for the app store.
This integrration requires a paid subscriptions, and currently utilises google cloud storage as an intermediate storage lcoation on which to store the screenshots generated in the integration test.  These need to be publicly accessible to the screenshots pro API.

## Requirements
1. NodeJS
2. ADB
3. [applesimutils](https://github.com/wix/AppleSimulatorUtils) (for ios operations)

## Development
1. Build the distribution code: `npm run build`
2. Configure the .env file
3. Run the server: `npm run start`
4. Debug mode: `npm run dev`

## Deployment
1. Install nodejs
2. Install dependencies: `npm install`
3. Configure the .env file
4. Run the server: `node server.js`

## Configuration
The server can be configured via the following environment variables in .env (see .env.sample for the available options)

## Limitations
The server only currently supports a single running emulator for each target platform as it issues commands targeting the default booted emulator.
## Usage
Call the service as follows from your integration test
Note that the localhost differs for android from the typical 127.0.0.1
- android `http://10.0.2.2:3000`
- ios `http://localhost:3000`

### Device Screenshots
Trigger screen capture from the emulator (rather than using the flutter driver to capture the screen)

```dart
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  await http.post(Uri.parse("http://10.0.2.2:3000/screenshot/android"), headers: headers,
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

  await http.post(Uri.parse("http://localhost:3000/permissions/ios"), headers: headers,
      body: jsonEncode({ "perms": "location=always", "bundleId": "<bundleId>" })
  ).then((resp) {
    if(resp.statusCode == 200) {
      print("Permissions set");
    } else {
      print("Settings permissions failed with code ${resp.statusCode}: ${resp.body}");
    }
  }).catchError((err) => print("Error sending request to set ios permissions: ${err}"));
```

### GPS Location
Set the GPS location of the emulator

```dart
  print("Sending request to set location on device");
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  await http.post(Uri.parse("http://localhost:3000/location/ios"), headers: headers,
      body: jsonEncode({ "lat": 37.422, "lon": -122.084 })
  ).then((resp) {
    if(resp.statusCode == 200) {
      print("Location set");
    } else {
      print("Settings location failed with code ${resp.statusCode}: ${resp.body}");
    }
  }).catchError((err) => print("Error sending request to set ios location: ${err}"));
```

### Deeplinks
Send a deeplink to the emulator

```dart
  String link = "https://www.example.com/deeplink";
  String packageId = "com.example.app";
  print("Sending deeplink $link to device");
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  await http.post(Uri.parse("http://localhost:3000/deeplink/ios"), headers: headers,
      body: jsonEncode({ "link": link, "packageId": packageId })
  ).then((resp) {
    if(resp.statusCode == 200) {
      print("Location set");
    } else {
      print("Settings location failed with code ${resp.statusCode}: ${resp.body}");
    }
  }).catchError((err) => print("Error sending request to set ios location: ${err}"));
```

### App Launch
/launch-app/:platform
```dart
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  String bundleId = "com.example.app";

  return await http.post(Uri.parse("${adbServerBaseUrl()}/launch-app/${Platform.operatingSystem}"), headers: headers,
      body: jsonEncode(jsonEncode({ "packageId": bundleId, "activity": "${bundleId}.MainActivity" }))
  ).then((resp) {
    if(resp.statusCode == 200) {
      print("Request to launch app for ${Platform.operatingSystem} locale $locale");
    } else {
      print("Request to launch app for ${Platform.operatingSystem} locale $locale with code ${resp.statusCode}: ${resp.body}");
    }
  }).catchError((err) => print("Error launching app: ${err}"));
```
