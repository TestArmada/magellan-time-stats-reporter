/* eslint no-undef: 0, no-unused-expressions: 0, filenames/filenames: 0,
  no-magic-numbers: 0, callback-return: 0*/
"use strict";

var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");

var Reporter = require("../index");
var completeData = require("./data/complete-data");
var failedTest = require("./data/failed-test-data");

describe("Reporter", function () {
  it("should exist", function () {
    expect(Reporter).to.not.be.null;
  });

  it("should run without events", function () {
    var spy = sinon.spy();
    var a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: function () {
          return [];
        },
        getEmitter: function () {
          return {
            addListener: function () {}
          };
        }
      }
    }).then(function () {
      a.flush();
      expect(spy.called).to.be.true;
    });
  });

  it("should run have some global events", function () {
    var spy = sinon.spy();
    var a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: function () {
          return [
            null,
            {},
            {type: "foo"},
            {type: "foo", data: []},
            {type: "analytics-event", data: {
              name: "foo",
              markers: []
            }},
            {type: "analytics-event-mark"},
            {type: "analytics-event-mark",
              data: []},
            {type: "analytics-event-mark",
              eventName: "bar",
              data: {t: 100, name: "foo"}},
            {type: "analytics-event-mark",
              eventName: "foo",
              data: {t: 100, name: "foo"}}
          ];
        },
        getEmitter: function () {
          return {
            addListener: function () {}
          };
        }
      }
    }).then(function () {
      a.flush();
      expect(spy.called).to.be.true;
    });
  });

  it("should allow listeners", function () {
    var spy = sinon.spy();
    var a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: function () {
          return [];
        },
        getEmitter: function () {
          return {
            addListener: function () {}
          };
        }
      }
    }).then(function () {
      a.listenTo(null, null, {
        addListener: function () {}
      });
      a.listenTo("a", null, {
        addListener: function () {}
      });
      a.listenTo(null, "b", {
        addListener: function () {}
      });
      a.listenTo("a", "b", {
        addListener: function () {}
      });
      a.flush();
      expect(spy.called).to.be.true;
    });
  });

  it("should handle test messages", function () {
    var spy = sinon.spy();
    var a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: function () {
          return [];
        },
        getEmitter: function () {
          return {
            addListener: function () {}
          };
        }
      }
    }).then(function () {
      a.listenTo("a", "b", {
        addListener: function (name, cb) {
          expect(name).to.eql("message");
          cb();
          cb({});
          cb({type: "foo"});
          cb({type: "foo", data: []});
          cb({type: "analytics-event", data: {
            name: "foo",
            markers: []
          }});
          cb({type: "analytics-event-mark"});
          cb({type: "analytics-event-mark",
            data: []});
          cb({type: "analytics-event-mark",
            eventName: "bar",
            data: {t: 100, name: "foo"}});
          cb({type: "analytics-event-mark",
            eventName: "foo",
            data: {t: 100, name: "foo"}});
        }
      });
      a.flush();
      expect(spy.called).to.be.true;
    });
  });

  it("should handle a passing test", function () {
    var spy = sinon.spy();
    var a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: function () {
          return [];
        },
        getEmitter: function () {
          return {
            addListener: function () {}
          };
        }
      }
    }).then(function () {
      for (var i in completeData) {
        var message = completeData[i];
        if (message.type === "global") {
          a._handleGlobalMessage(message.message);
        } else {
          a._handleTestRunMessage(message.testRun, message.test, message.message);
        }
      }
      a.flush();
    });
  });

  it("should handle a failed test", function () {
    var spy = sinon.spy();
    var a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: function () {
          return [];
        },
        getEmitter: function () {
          return {
            addListener: function () {}
          };
        }
      }
    }).then(function () {
      for (var i in failedTest) {
        var message = failedTest[i];
        if (message.type === "global") {
          a._handleGlobalMessage(message.message);
        } else {
          a._handleTestRunMessage(message.testRun, message.test, message.message);
        }
      }
      a.flush();
    });
  });

  it("should handle diffMarkerTimes variants", function () {
    expect(Reporter.diffMarkerTimes(null, null)).to.eql(0);
    expect(Reporter.diffMarkerTimes({t: 0}, null)).to.eql(0);
    expect(Reporter.diffMarkerTimes(null, {t: 0})).to.eql(0);
    expect(Reporter.diffMarkerTimes({t: 0}, {t: 110})).to.eql(110);
  });

  it("should handle poorly formed diffMarkers", function () {
    expect(Reporter.diffMarkers({markers: []})).to.eql(0);
  });
});
