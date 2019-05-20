'use strict'

const express = require('express');
const GenerateStats = require('./modules-local/generate-stats');
var   schedule = require('node-schedule');
const config = {
  products: ['Core', 'External Software Affecting Firefox',
             'Firefox', 'Firefox Build System', 'Firefox for iOS', 'Firefox for Android',
             'DevTools', 'GeckoView', 'NSPR', 'NSS', 'WebExtensions', 'Toolkit', 'Remote Protocol'],
  exclude: ['ca cert'], // components to exclude, can be partial strings
  types: ['defect'],
  versions: [
    {number: 67, mergedate: '2019-01-21'}
  ]
};

// Method to periodically run to generate stats

function update() {
  var myStats = new GenerateStats(config);
}

// update at midnight
var rule = new schedule.RecurrenceRule();
rule.hour = 14;
rule.minute = 0;

var j = schedule.scheduleJob(rule, update);

// get first set of data
update();

var app = express();

app.use(express.static('public'));

app.get("/", (request, response) => {
  response.sendFile(__dirname + '/views/index.html');
});

app.get("/component", (request, response) => {
  response.sendFile(__dirname + '/out/component.json');
});

// listen for requests :)
var listener = app.listen(process.env.PORT || 8080, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
