/* eslint no-undef: 0, no-unused-expressions: 0, filenames/filenames: 0,
  no-magic-numbers: 0, callback-return: 0*/
"use strict";

const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");

const Reporter = require("../index");
const completeData = require("./data/complete-data");
const failedTest = require("./data/failed-test-data");

describe("Reporter", () => {
  it("should exist", () => {
    expect(Reporter).to.not.be.null;
  });

  it("should run without events", () => {
    const spy = sinon.spy();
    const a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: () => {
          return [];
        },
        getEmitter: () => {
          return {
            addListener: () => {}
          };
        }
      }
    }).then(() => {
      a.flush();
      expect(spy.called).to.be.true;
    });
  });

  it("should run have some global events", () => {
    const spy = sinon.spy();
    const a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: () => {
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
        getEmitter: () => {
          return {
            addListener: () => {}
          };
        }
      }
    }).then(() => {
      a.flush();
      expect(spy.called).to.be.true;
    });
  });

  it("should allow listeners", () => {
    const spy = sinon.spy();
    const a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: () => {
          return [];
        },
        getEmitter: () => {
          return {
            addListener: () => {}
          };
        }
      }
    }).then(() => {
      a.listenTo(null, null, {
        addListener: () => {}
      });
      a.listenTo("a", null, {
        addListener: () => {}
      });
      a.listenTo(null, "b", {
        addListener: () => {}
      });
      a.listenTo("a", "b", {
        addListener: () => {}
      });
      a.flush();
      expect(spy.called).to.be.true;
    });
  });

  it("should handle test messages", () => {
    const spy = sinon.spy();
    const a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: () => {
          return [];
        },
        getEmitter: () => {
          return {
            addListener: () => {}
          };
        }
      }
    }).then(() => {
      a.listenTo("a", "b", {
        addListener: (name, cb) => {
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

  it("should handle a passing test", () => {
    const spy = sinon.spy();
    const a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: () => {
          return [];
        },
        getEmitter: () => {
          return {
            addListener: () => {}
          };
        }
      }
    }).then(() => {
      for (const i in completeData) {
        const message = completeData[i];
        if (message.type === "global") {
          a._handleGlobalMessage(message.message);
        } else {
          a._handleTestRunMessage(message.testRun, message.test, message.message);
        }
      }
      a.flush();
    });
  });

  it("should handle a failed test", () => {
    const spy = sinon.spy();
    const a = new Reporter({
      console: {
        log: spy
      }
    });
    a.initialize({
      analytics: {
        sync: () => {
          return [];
        },
        getEmitter: () => {
          return {
            addListener: () => {}
          };
        }
      }
    }).then(() => {
      for (const i in failedTest) {
        const message = failedTest[i];
        if (message.type === "global") {
          a._handleGlobalMessage(message.message);
        } else {
          a._handleTestRunMessage(message.testRun, message.test, message.message);
        }
      }
      a.flush();
    });
  });

  it("should handle diffMarkerTimes variants", () => {
    expect(Reporter.diffMarkerTimes(null, null)).to.eql(0);
    expect(Reporter.diffMarkerTimes({t: 0}, null)).to.eql(0);
    expect(Reporter.diffMarkerTimes(null, {t: 0})).to.eql(0);
    expect(Reporter.diffMarkerTimes({t: 0}, {t: 110})).to.eql(110);
  });

  it("should handle poorly formed diffMarkers", () => {
    expect(Reporter.diffMarkers({markers: []})).to.eql(0);
  });
});
