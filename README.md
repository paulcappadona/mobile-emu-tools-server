# ADB Invocation Server
This is a small node server to be run on the host machine executing an android integration test.
It currently only support executing the screenshot operation via ADB, this is to work around FLutter Driver's
limitations of not being able to take screenshots on Android when using the Google Maps widget.

## Requirements
1. NodeJS
2. ADB

## Installation
1. Install nodejs
2. Install dependencies: `npm install`
3. Run the server: `node server.js`

## Configuration
The server can be configured via the following environment variables in .env

## Usage
Call the service as follows from your integration test

```dart
  Map<String, String> headers = {};
  headers['Content-Type'] = 'application/json';

  await http.post(Uri.parse("http://10.0.2.2:3000/"), headers: headers,
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
