'use strict';

// modules
const got = require('got');
const moment = require('moment');
const parse = require('csv-parse');
const stringify = require('csv-stringify');
const fs = require('fs');
const asTable = require('as-table').configure ({ right: true });

var GenerateStats = function(config) {

    const max = 10000; // max records we can read from Bugzilla

    var branchDate = '2019-01-21'; // YYYY-MM-DD of first nightly of current release
    var last = 0; // last bug id we saw
    var count = 0; // number of records we got in a GET
    var done = false;
    
    var URLbase = `https://bugzilla.mozilla.org/buglist.cgi?chfield=%5BBug%20creation%5D&chfieldfrom=${branchDate}&chfieldto=Now&columnlist=triage_owner%2Cproduct%2Ccomponent%2Cbug_status%2Cresolution%2Cpriority%2Ckeywords%2Creporter%2Cassigned_to%2Cshort_desc%2Cchangeddate%2Copendate&email1=intermittent-bug-filer%40mozilla.bugs&emailreporter1=1&emailtype1=notequals&f1=bug_id&f2=bug_severity&f3=keywords&limit=0&o1=greaterthan&o2=notequals&o3=nowordssubstr&product=Core&product=DevTools&product=External%20Software%20Affecting%20Firefox&product=Firefox&product=Firefox%20Build%20System&product=Firefox%20for%20Android&product=Firefox%20for%20Echo%20Show&product=Firefox%20for%20FireTV&product=Firefox%20for%20iOS&product=Focus&product=Focus-iOS&product=GeckoView&product=NSPR&product=NSS&product=Toolkit&product=WebExtensions&short_desc=%5E%5C%5Bmeta&short_desc_type=notregexp&v2=enhancement&v3=meta%2C%20feature&ctype=csv&bug_type=defect&human=1&v1=`;
    
    // create array to store data read
    var data = [];
    
    // create data structure to hold results
    var report = {'triage_owner': [], 'component': []};
    
    // current date
    var now = moment.utc();

    function get_parser() {
        return parse({
            delimiter: ',', 
            columns: true
        })
        .on('readable', function() {
            let record;
            while (record = parser.read()) {
    
                let triage_owner = record['Triage Owner'];
                let component    = record.Product + '::' + record.Component;
    
                data.push(record);
                count++;
    
                if (record.Resolution.trim() === '---') {
                    // first update the triage owner totals
                    if (report.triage_owner[triage_owner]) {
                        report.triage_owner[triage_owner].total ++;
                    } else {
                        report.triage_owner[triage_owner] = {
                            total: 1,
                            '--' : 0,
                            '> M': 0,
                            '< M': 0,
                            '< W': 0,
                            p1: 0,
                            p2: 0,
                            p3: 0,
                            p4: 0,
                            p5: 0
                        };
                    }
    
                    // then update the component totals
                    if (report.component[component]) {
                        report.component[component].total ++;
                    } else {
                        report.component[component] = {
                            total: 1,
                            '--' : 0,
                            '> M': 0,
                            '< M': 0,
                            '< W': 0,
                            p1: 0,
                            p2: 0,
                            p3: 0,
                            p4: 0,
                            p5: 0
                        };
                    }
    
                    var priority = record.Priority.trim().toLowerCase();
    
                    // then the per-owner triage totals
                    report.triage_owner[triage_owner][priority] ++;
    
                    // and the per-component triage totals
                    report.component[component][priority] ++;
    
                    // and age group totals
                    if (priority === '--') {
                        // then ages of untriaged-totals
                        var creation = new moment(record.Opened);
                        var age = moment.duration(now.diff(creation)).asWeeks();
                        var group;
    
                        if (age <= 1) {
                            group = '< W';
                        } else if (age <= 4) {
                            group = '< M';
                        } else {
                            group = '> M';
                        }
    
                        report.triage_owner[triage_owner][group] ++;
                        report.component[component][group] ++;
                    }

                    if(record["Bug ID"] > last) {
                        last = record["Bug ID"];
                    }
                }
            }
        })
        .on('error', function(err) {
            console.error(err.message);
        })
        .on('end', function() {
            console.info('got', count, 'records');
            console.info('last id', last);
            // check for boundary
            if (count < max) {
                done = true;
                console.log('read last batch');
                Object.keys(report).forEach(reportName => {
                    // write data, first turning the report object into an array of objects
                    // then sorting by the number of untriaged bugs, descending
                    let formatted = Object.keys(report[reportName]).map(category => {
                        return {
                            Category: category,
                            'Untriaged': report[reportName][category]['--'],
                            '%': (report[reportName][category].total > 0 ? Math.round(report[reportName][category]['--']/report[reportName][category].total*100) : '--'),
                            '> M': report[reportName][category]['> M'],
                            '> W': report[reportName][category]['< M'] + report[reportName][category]['> M'],
                            '< W': report[reportName][category]['< W'],
                            'P1': report[reportName][category].p1,
                            'P2': report[reportName][category].p2,
                            'P3': report[reportName][category].p3,
                            'P4': report[reportName][category].p4,
                            'P5': report[reportName][category].p5,
                            'Total': report[reportName][category].total
                        };
                    }).sort((a, b) => { return (b['> W'] - a['> W']); });
                    console.log(asTable(formatted));
                    write_report(reportName, formatted);

                });
            } else {
                start_stream(last);
            }
    
        });
    }
    
    function start_stream(last) {
        var URL = URLbase + last;
        count = 0;
        console.info('fetching', URL);
        parser = get_parser();
        bug_stream = got.stream(URL).pipe(parser);
    }
    
    function write_report(reportName, data) {
        fs.exists('./out', (exists) => {
            if (!exists) {
                fs.mkdir('./out', (err) => {
                    if (err) {
                        console.error(err);
                    } else {
                        write_report(reportName, data);
                    }
                });
            } else {
                // write csv
                var file = fs.openSync(`./out/${reportName}.csv`, 'w');
                stringify(data, {
                    header: true
                }, (err, output) => {
                    if (err) {
                        console.error(err);
                    } else {
                        fs.writeFile(file, output, (err) => {
                            if (err) {
                                console.error(err);
                            } else {
                                console.log(`saved data in ./out/${reportName}.csv`);
                            }
                        });
                    }
                });
                // write json
                var json = fs.openSync(`./out/${reportName}.json`, 'w');
                fs.writeFile(json, JSON.stringify(data), (err) => {
                    if (err) {
                        console.error(err);
                    } else {
                        console.log(`saved data in ./out/${reportName}.json`);
                    }
                });
            }
        });
    }

    var bug_stream, parser;

    start_stream(last);

};

module.exports = GenerateStats;