var Server = require("upnpserver");
 
var server = new Server(
  { httpPort: 10293 }, 
  [
    { path: '/home/jm/Documents/node/train/media' , mountPoint: '/Music' , type: 'music'  },
  ]);
 
server.start();
