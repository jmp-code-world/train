# Google Home train table update

This is really an example on how to plug together google home with ifttt and some custom script to report on the speaker the next train to Wimbledon.

## Use case

User: 'Ok Google, when is the next train to Wimbledon'
Google Home reply: 'The 14:17 to Wimbledon is On time'

## Behind the scene

The 'when is the next train to Wimbledon' is a trigger in ifttt Google Assistant (the 'IF This' part).
The 'Then That' is a Maker Webhooks Web Request, that point to a public URL. This is what triggers the nodejs application to perform my custom action.

The nodejs application is in 4 parts:
1. Query the national rail database to find the next train on my route. This returns a json block with various data.
2. Convert the json block into a simple text string message.
3. Use google TTS to conver the message into a mp3 file. Store the mp3 file into a location that is monitored by a small dlna server.
4. Send a request to the chromecast in my Google Home speaker to play the mp3 message from the dlna server.

## Things to be aware of:
1. The request must be done over https with a security token of some sort. I do have an apache server in between to take care of that aspect. 
2. The dlna url is hard coded. This should be queried from the sqlite database.
3. Do not forget to copy/rename the sample_config.yaml file to config.yaml and add your own values.

Special thanks to @thibauts for his castv2-client library that makes it all possible.

