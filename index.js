/* eslint no-extra-parens: 0, max-params: 0, max-statements: 0, no-magic-numbers: 0,
  prefer-template: 0 */
"use strict";

const Q = require("q");
const prettyMs = require("pretty-ms");
const _ = require("lodash");
const clc = require("cli-color");

const timeline = [];

const hasMarker = (ev, markerName) =>
  ev.markers.find((marker) => marker.name === markerName);

const firstMarker = (ev) => ev.markers[0];

const lastMarker = (ev) => ev.markers[ev.markers.length - 1];

const diffMarkerTimes = (startMarker, endMarker) => {
  if (startMarker && endMarker) {
    return endMarker.t - startMarker.t;
  } else {
    return 0;
  }
};

const diffMarkers = (ev, startName, endName, alternateEndName) => {
  startName = startName ? startName : "start";
  endName = endName ? endName : "end";

  const startMarker = ev.markers.find((marker) => marker.name === startName);
  const endMarker = ev.markers.find((marker) =>
    (alternateEndName && marker.name === alternateEndName) || marker.name === endName
  );
  return diffMarkerTimes(startMarker, endMarker);
};

class Reporter {
  constructor(opts) {
    this.options = {
      console
    };
    /* istanbul ignore else */
    if (opts && opts.console) {
      this.options.console = opts.console;
    }
  }

  initialize(magellanGlobals) {
    const analytics = magellanGlobals.analytics;
    const deferred = Q.defer();
    deferred.resolve();

    analytics.sync().forEach((message) => {
      this._handleGlobalMessage(message);
    });

    // listen to global emitter
    analytics.getEmitter().addListener("message", this._handleGlobalMessage.bind(this));

    return deferred.promise;
  }

  // listen to a testRun's events on event emitter source.
  listenTo(testRun, test, source) {
    if (test && testRun) {
      // Every time a message is received regarding this test, we also get the test object
      // itself so that we're able to reason about retries, worker index, etc.
      source.addListener("message", this._handleTestRunMessage.bind(this, testRun, test));
    } else {
      source.addListener("message", this._handleGlobalMessage.bind(this));
    }
  }

  //
  // Timeline marker: A timeline marker pertaining to a previously-received analytics event.
  // Data structure for a timeline marker
  // {
  //   name: string marker name (eg: "failed", "passed", "end")
  //   t: number timestamp
  // }
  //

  // handle a message from a test
  _handleTestRunMessage(testRun, test, message) {
    if (message && message.type && message.data) {
      if (message.type === "analytics-event") {
        timeline.push(message.data);
      } else if (message.type === "analytics-event-mark" && message.data) {
        // Find a previously-received event in our timeline and amend it with this marker.
        for (let i = timeline.length - 1; i >= 0; i--) {
          if (timeline[i].name === message.eventName) {
            timeline[i].markers.push(message.data);
            break;
          }
        }
      }
    }
  }

  // handle a message from a global source
  _handleGlobalMessage(message) {
    if (message && message.type && message.data) {
      if (message.type === "analytics-event") {
        timeline.push(message.data);
      } else if (message.type === "analytics-event-mark" && message.data) {
        // Find a previously-received event in our timeline and amend it with this marker.
        for (let i = timeline.length - 1; i >= 0; i--) {
          if (timeline[i].name === message.eventName) {
            timeline[i].markers.push(message.data);
            break;
          }
        }
      }
    }
  }

  flush() {
    let numFailedTests = 0;
    let numPassedTests = 0;
    let numRetries = 0;

    const magellanRun = _.find(timeline, (item) => item.name === "magellan-run");
    const magellanTime = diffMarkers(magellanRun, "start", "passed", "failed");

    const testRuns = _.filter(timeline, (item) => _.startsWith(item.name, "test-run-"));

    const notTestRuns = _.filter(timeline, (item) => !_.startsWith(item.name, "test-run-"));

    const timeSpentPassing = _.reduce(testRuns, (result, testRun) => {
      const startMarker = testRun.markers.find((marker) => marker.name === "start");
      const endMarker = testRun.markers.find((marker) => marker.name === "passed");

      if (startMarker && endMarker) {
        numPassedTests++;
        return result + endMarker.t - startMarker.t;
      } else {
        return result;
      }
    }, 0);

    const timeSpentRetrying = _.reduce(testRuns, (result, testRun) => {
      const startMarker = testRun.markers.find((marker) => marker.name === "start");
      const endMarker = testRun.markers.find((marker) =>
        marker.name === "passed" || marker.name === "failed"
      );

      if (startMarker && endMarker && testRun.metadata.attemptNumber > 1) {
        numRetries++;
        return result + endMarker.t - startMarker.t;
      } else {
        return result;
      }
    }, 0);

    const timeSpentFailing = _.reduce(testRuns, (result, testRun) => {
      const startMarker = testRun.markers.find((marker) => marker.name === "start");
      const endMarker = testRun.markers.find((marker) => marker.name === "failed");

      if (startMarker && endMarker) {
        numFailedTests++;
        return result + endMarker.t - startMarker.t;
      } else {
        return result;
      }
    }, 0);

    const slowestFailingTest = _.chain(testRuns)
      .filter((testRun) => hasMarker(testRun, "failed"))
      .maxBy((testRun) => diffMarkers(testRun, "start", "failed"))
      .value();

    const slowestPassingTest = _.chain(testRuns)
      .filter((testRun) => hasMarker(testRun, "passed"))
      .maxBy(testRuns, (testRun) => diffMarkers(testRun, "start", "passed"))
      .value();

    this.options.console.log(clc.greenBright("\n============= Runtime Stats ==============\n"));
    this.options.console.log("");
    this.options.console.log(`                 # Test runs: ${testRuns.length}`);
    this.options.console.log(`          # Passed test runs: ${numPassedTests}`);
    this.options.console.log(`          # Failed test runs: ${numFailedTests}`);
    this.options.console.log(`           # Re-attempt runs: ${numRetries}`);
    this.options.console.log("");
    this.options.console.log("                  Human time: " +
      prettyMs(timeSpentFailing + timeSpentPassing));
    this.options.console.log("               Magellan time: " + prettyMs(magellanTime));
    if (magellanTime > 0) {
      this.options.console.log("Human-to-Magellan multiplier: " +
      ((timeSpentFailing + timeSpentPassing) / magellanTime).toFixed(2) + "X");
    } else {
      this.options.console.log("Human-to-Magellan multiplier: N/A");
    }

    this.options.console.log(`    Human time spent passing: ${prettyMs(timeSpentPassing)}`);
    this.options.console.log(`    Human time spent failing: ${prettyMs(timeSpentFailing)}`);
    this.options.console.log("");

    if (numRetries > 0 && magellanTime > 0) {
      this.options.console.log(`         Human time retrying: ${prettyMs(timeSpentRetrying)}`);
      this.options.console.log("Retrying as % of total human: " +
        (timeSpentRetrying / (timeSpentFailing + timeSpentPassing)).toFixed(1) + "%");
    }

    /* istanbul ignore else */
    if (testRuns.length > 0) {
      this.options.console.log("       Average test run time: " +
        prettyMs((timeSpentFailing + timeSpentPassing) / testRuns.length));
    } else {
      this.options.console.log("       Average test run time: N/A");
    }

    /* istanbul ignore else */
    if (numFailedTests > 0) {
      this.options.console.log("Average failed test run time: " +
        prettyMs(timeSpentFailing / numFailedTests));
    } else {
      this.options.console.log("Average failed test run time: N/A");
    }

    /* istanbul ignore else */
    if (numPassedTests > 0) {
      this.options.console.log("Average passed test run time: " +
        prettyMs(timeSpentPassing / numPassedTests));
    } else {
      this.options.console.log("Average passed test run time: N/A");
    }

    /* istanbul ignore else */
    if (slowestPassingTest) {
      this.options.console.log("");
      this.options.console.log("Slowest passing test:");
      this.options.console.log("      test: \"" + slowestPassingTest.metadata.test +
        "\" @: " + slowestPassingTest.metadata.browser + " ");
      this.options.console.log(" attempt #: " + slowestPassingTest.metadata.attemptNumber);
    }

    /* istanbul ignore else */
    if (slowestFailingTest) {
      this.options.console.log("");
      this.options.console.log("      test: \"" + slowestFailingTest.metadata.test +
        "\" @: " + slowestFailingTest.metadata.browser + " ");
      this.options.console.log(" attempt #: " + slowestFailingTest.metadata.attemptNumber);
    }

    /* istanbul ignore else */
    if (notTestRuns.length > 0) {
      const metrics = _.filter(notTestRuns, (metric) =>
        metric.markers && metric.markers.length === 2
      );

      /* istanbul ignore else */
      if (metrics.length) {
        this.options.console.log("");
        this.options.console.log("Other timing metrics: ");
        metrics.forEach((metric) => {
          const start = firstMarker(metric);
          const end = lastMarker(metric);
          const time = diffMarkerTimes(start, end);
          this.options.console.log("    " + metric.name + " (" + start.name + " -> " +
            end.name + ") " + prettyMs(time));
        });
        this.options.console.log("");
      }
    }

    this.options.console.log("");
  }
}

module.exports = Reporter;
module.exports.diffMarkerTimes = diffMarkerTimes;
module.exports.diffMarkers = diffMarkers;
