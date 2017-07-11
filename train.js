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
var os = require( 'os' );
var unixTime = require('unix-time');
var util= require('util');

// Get default config, or throw exception on error
try {
   var config = yaml.safeLoad(fs.readFileSync( require('path').resolve( __dirname,'./config.yaml'), 'utf8'));
} catch (e) {
    console.log(e);
}

// Find my public IP
var networkInterfaces = os.networkInterfaces();
console.log( 'Server IP: ' + networkInterfaces.eth0[0].address );

// Server static files form the current working location
app.use(express.static( __dirname ))

// Try to dynamically identify the chromecast.
var mdns = require('mdns');
// Hack from https://github.com/agnat/node_mdns/issues/130
var sequence = [
    mdns.rst.DNSServiceResolve(),
    'DNSServiceGetAddrInfo' in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({families:[4]}),
    mdns.rst.makeAddressesUnique()
];
var browser = mdns.createBrowser(mdns.tcp('googlecast'), {resolverSequence: sequence});
browser.on('error', function (error) {
    switch (error.errorCode) {
        case mdns.kDNSServiceErr_Unknown:
            console.warn("This is what we see: " + error);
            setTimeout(createAdvertisement, 5000);
            break;
        default:
            console.error(error);
            throw(error);
    }
});
browser.on('serviceUp', function(service) {
    console.log('found device "%s" at %s:%d', service.name, service.addresses[0], service.port);
    if (service.name.startsWith(config.chromecast.name)) {
        console.log( 'Will now use: ' + service.addresses[0]);
        config.chromecast.ip=service.addresses[0]
    }
});
browser.start();

app.get('/', function (req, res) {
    var train_msg;
    // This is how to get the train status from MDS to WIM
    train_update_url = util.format( 'https://huxley.apphb.com/departures/%s/to/%s/2?accessToken=%s' ,
                                                                config.nationalrail.from_station.code, 
                                                                config.nationalrail.to_station.code, 
                                                                config.nationalrail.accessToken);
    console.log(train_update_url);
    request( train_update_url , function(error,response,body) {

        var trainServices = JSON.parse(body);
        timestamp = unixTime(new Date());

        train_msg='';

        for (var i = 0, len = trainServices.trainServices.length; i < len; i++) {
            service=trainServices.trainServices[i];
            if (i==0) {
                if (service.etd=='On time') {
                    train_msg+="The " + service.std + " service to " + config.nationalrail.to_station.name + " is " + service.etd + ". ";
                } else {
                    train_msg+="The " + service.std + " service to " + config.nationalrail.to_station.name + " is delayed, and will be at " + service.etd + ". ";
                }
            } else {
                if (service.etd=='On time') {
                    train_msg+="Next the " + service.std + " service is " + service.etd + ".";
                } else {
                    train_msg+="Next the " + service.std + " service is delayed, and will be at " + service.etd + ".";
                }
            }
        }        
        console.log( train_msg );

        // can we now get the speach associated to this
        // wget -q -U Mozilla -O output.mp3 "http://translate.google.com/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&q=The 16:47 service is 16:51.&tl=En-us"
        var options = {
            host: 'translate.google.com',
            port: 80,
            path: '/translate_tts?ie=UTF-8&total=1&idx=0&client=tw-ob&tl=En-gb&q=' + require('querystring').escape(train_msg),
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
                train_msg_file = config.nationalrail.media_dir + '/' + timestamp + '-' + config.nationalrail.media_file ; 
                fs.writeFile( train_msg_file , mp3data, 'binary', function(err){
                    if (err) throw err;
                    console.log('File ' + train_msg_file + ' saved.');
                    // Update ID3 tags.
                    nodeID3.write( config.nationalrail.media_tags, train_msg_file );
                    console.log('Tags updated.');
                    // This is where we inject the chromecast call
                    var client = new Client();
                    client.connect(config.chromecast.ip, function() {
                        console.log('Connected, launching playback ...');
                        client.launch(DefaultMediaReceiver, function(err, player) {
                            var media = {
                                contentId: 'http://' + networkInterfaces.eth0[0].address + ':' + config.server.port + '/' + train_msg_file,
                                contentType: 'audio/mpeg3',
                                streamType: 'BUFFERED'
                            };
                            player.on('status', function(status) {
                                console.log('status broadcast playerState=%s', status);
                            });
                            player.load(media, { autoplay: true }, function(err, status) {
                                console.log('err: ' + err );
                                console.log('media loaded playerState=%s', status);
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
    res.send( train_msg );
});

app.listen(config.server.port, function () {
    console.log('Train update app listening on port ' + config.server.port + '!');
});
