#!/usr/bin/env node

var express = require('express');
var app = express();
var request = require('request');
var http = require('http');
var fs = require('fs');
var Client = require('castv2-client').Client;
var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
var yaml = require('js-yaml');
var nodeID3 = require('node-id3');
// var UPNPServer = require("upnpserver");

// Get default config, or throw exception on error
try {
   var config = yaml.safeLoad(fs.readFileSync( require('path').resolve( __dirname,'./config.yaml'), 'utf8'));
} catch (e) {
    console.log(e);
}

// Server static files form the current working location
app.use(express.static( __dirname ))

app.get('/', function (req, res) {
    var train_msg;
    // This is how to get the train status from MDS to WIM
    request( 'https://huxley.apphb.com/departures/mds/to/wim/1?accessToken=' + config.nationalrail.accessToken, function(error,response,body) {
        var trainServices = JSON.parse(body);
        trainServices.trainServices.forEach(function(service){
            // console.log('service:', service);
            if (service.etd=='On time') {
                train_msg=require('querystring').escape("The " + service.std + " service to Wimbledon is " + service.etd + ".");
            } else {
                train_msg=require('querystring').escape("The " + service.std + " service to Wimbledon is delayed, and will be at " + service.etd + ".");
            }
            console.log( train_msg );

            // can we now get the speach associated to this
            // wget -q -U Mozilla -O output.mp3 "http://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&q=The 16:47 service is 16:51.&tl=En-us"
            var options = {
                host: 'translate.google.com',
                port: 80,
                path: '/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&tl=En-gb&q=' + train_msg,
                headers: {
                    'User-Agent': 'Mozilla'
                }
            }
            var ttsreq = http.get(options, function(ttsres){ 
                var mp3data = '';
                ttsres.setEncoding('binary');
                ttsres.on('data', function(chunk){
                    mp3data += chunk;
                });

                ttsres.on('end', function(){
                    train_msg_file = config.nationalrail.media_dir + '/' + config.nationalrail.media_file ; 
                    fs.writeFile( train_msg_file , mp3data, 'binary', function(err){
                        if (err) throw err;
                        console.log('File saved.');
                        // Update ID3 tags.
                        nodeID3.write( config.nationalrail.media_tags, train_msg_file );
                        console.log('Tags updated.');
                        // This is where we inject the chromecast call
                        // chromecast -H 192.168.1.22 play http://192.168.1.6:8200/MediaItems/312.mp3
                        // chromecast -H 192.168.1.22 play http://192.168.1.6:10293/cds/content/14
                        var client = new Client();
                        client.connect(config.chromecast.ip, function() {
                            console.log('Connected, launching playback ...');
                            client.launch(DefaultMediaReceiver, function(err, player) {
                                var media = {
                                    contentId: 'http://192.168.1.6:' + config.server.port + '/' + train_msg_file,
                                    contentType: 'audio/mpeg3',
                                    streamType: 'BUFFERED'

                                };
                                player.on('status', function(status) {
                                    console.log('status broadcast playerState=%s', status.playerState);
                                });
                                player.load(media, { autoplay: true }, function(err, status) {
                                    console.log('err: ' + err );
                                    console.log('media loaded playerState=%s', status.playerState);
                                });
                            });
                        });
                        client.on('error', function(err) {
                            console.log('Error: %s', err.message);
                            client.close();
                        });

                    });
                });
            });
        });
    });
    res.send( train_msg );
});

app.listen(config.server.port, function () {
    console.log('Train update app listening on port ' + config.server.port + '!');
});
