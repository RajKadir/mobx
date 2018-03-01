"use strict"

var mobx = require("../../src/mobx")
var m = mobx
var observable = mobx.observable
var computed = mobx.computed
var transaction = mobx.transaction
const utils = require("../utils/test-utils")

var voidObserver = function() {}

function buffer() {
    var b = []
    var res = function(x) {
        b.push(x.newValue)
    }
    res.toArray = function() {
        return b
    }
    return res
}

test("argumentless observable", () => {
    var a = observable.box()

    expect(m.isObservable(a)).toBe(true)
    expect(a.get()).toBe(undefined)
})

test("basic", function() {
    var x = observable.box(3)
    var b = buffer()
    m.observe(x, b)
    expect(3).toBe(x.get())

    x.set(5)
    expect(5).toBe(x.get())
    expect([5]).toEqual(b.toArray())
    expect(mobx._isComputingDerivation()).toBe(false)
})

test("basic2", function() {
    var x = observable.box(3)
    var z = computed(function() {
        return x.get() * 2
    })
    var y = computed(function() {
        return x.get() * 3
    })

    m.observe(z, voidObserver)

    expect(z.get()).toBe(6)
    expect(y.get()).toBe(9)

    x.set(5)
    expect(z.get()).toBe(10)
    expect(y.get()).toBe(15)

    expect(mobx._isComputingDerivation()).toBe(false)
})

test("computed with asStructure modifier", function() {
    var x1 = observable.box(3)
    var x2 = observable.box(5)
    var y = m.computed(
        function() {
            return {
                sum: x1.get() + x2.get()
            }
        },
        { compareStructural: true }
    )
    var b = buffer()
    m.observe(y, b, true)

    expect(8).toBe(y.get().sum)

    x1.set(4)
    expect(9).toBe(y.get().sum)

    m.transaction(function() {
        // swap values, computation results is structuraly unchanged
        x1.set(5)
        x2.set(4)
    })

    expect(b.toArray()).toEqual([{ sum: 8 }, { sum: 9 }])
    expect(mobx._isComputingDerivation()).toBe(false)
})

test("dynamic", function(done) {
    try {
        var x = observable.box(3)
        var y = m.computed(function() {
            return x.get()
        })
        var b = buffer()
        m.observe(y, b, true)

        expect(3).toBe(y.get()) // First evaluation here..

        x.set(5)
        expect(5).toBe(y.get())

        expect(b.toArray()).toEqual([3, 5])
        expect(mobx._isComputingDerivation()).toBe(false)

        done()
    } catch (e) {
        console.log(e.stack)
    }
})

test("dynamic2", function(done) {
    try {
        var x = observable.box(3)
        var y = computed(function() {
            return x.get() * x.get()
        })

        expect(9).toBe(y.get())
        var b = buffer()
        m.observe(y, b)

        x.set(5)
        expect(25).toBe(y.get())

        //no intermediate value 15!
        expect([25]).toEqual(b.toArray())
        expect(mobx._isComputingDerivation()).toBe(false)

        done()
    } catch (e) {
        console.log(e.stack)
    }
})

test("readme1", function(done) {
    try {
        var b = buffer()

        var vat = observable.box(0.2)
        var order = {}
        order.price = observable.box(10)
        // Prints: New price: 24
        //in TS, just: value(() => this.price() * (1+vat()))
        order.priceWithVat = computed(function() {
            return order.price.get() * (1 + vat.get())
        })

        m.observe(order.priceWithVat, b)

        order.price.set(20)
        expect([24]).toEqual(b.toArray())
        order.price.set(10)
        expect([24, 12]).toEqual(b.toArray())
        expect(mobx._isComputingDerivation()).toBe(false)

        done()
    } catch (e) {
        console.log(e.stack)
        throw e
    }
})

test("batch", function() {
    var a = observable.box(2)
    var b = observable.box(3)
    var c = computed(function() {
        return a.get() * b.get()
    })
    var d = computed(function() {
        return c.get() * b.get()
    })
    var buf = buffer()
    m.observe(d, buf)

    a.set(4)
    b.set(5)
    // Note, 60 should not happen! (that is d beign computed before c after update of b)
    expect(buf.toArray()).toEqual([36, 100])

    var x = mobx.transaction(function() {
        a.set(2)
        b.set(3)
        a.set(6)
        expect(d.value).toBe(100) // not updated; in transaction
        expect(d.get()).toBe(54) // consistent due to inspection
        return 2
    })

    expect(x).toBe(2) // test return value
    expect(buf.toArray()).toEqual([36, 100, 54]) // only one new value for d
})

test("transaction with inspection", function() {
    var a = observable.box(2)
    var calcs = 0
    var b = computed(function() {
        calcs++
        return a.get() * 2
    })

    // if not inspected during transaction, postpone value to end
    mobx.transaction(function() {
        a.set(3)
        expect(b.get()).toBe(6)
        expect(calcs).toBe(1)
    })
    expect(b.get()).toBe(6)
    expect(calcs).toBe(2)

    // if inspected, evaluate eagerly
    mobx.transaction(function() {
        a.set(4)
        expect(b.get()).toBe(8)
        expect(calcs).toBe(3)
    })
    expect(b.get()).toBe(8)
    expect(calcs).toBe(4)
})

test("transaction with inspection 2", function() {
    var a = observable.box(2)
    var calcs = 0
    var b
    mobx.autorun(function() {
        calcs++
        b = a.get() * 2
    })

    // if not inspected during transaction, postpone value to end
    mobx.transaction(function() {
        a.set(3)
        expect(b).toBe(4)
        expect(calcs).toBe(1)
    })
    expect(b).toBe(6)
    expect(calcs).toBe(2)

    // if inspected, evaluate eagerly
    mobx.transaction(function() {
        a.set(4)
        expect(b).toBe(6)
        expect(calcs).toBe(2)
    })
    expect(b).toBe(8)
    expect(calcs).toBe(3)
})

test("scope", function() {
    var vat = observable.box(0.2)
    var Order = function() {
        this.price = observable.box(20)
        this.amount = observable.box(2)
        this.total = computed(
            function() {
                return (1 + vat.get()) * this.price.get() * this.amount.get()
            },
            { context: this }
        )
    }

    var order = new Order()
    m.observe(order.total, voidObserver)
    order.price.set(10)
    order.amount.set(3)
    expect(36).toBe(order.total.get())
    expect(mobx._isComputingDerivation()).toBe(false)
})

test("props1", function() {
    var vat = observable.box(0.2)
    var Order = function() {
        debugger
        mobx.extendObservable(this, {
            price: 20,
            amount: 2,
            get total() {
                return (1 + vat.get()) * this.price * this.amount // price and amount are now properties!
            }
        })
    }

    var order = new Order()
    expect(48).toBe(order.total)
    order.price = 10
    order.amount = 3
    expect(36).toBe(order.total)

    var totals = []
    var sub = mobx.autorun(function() {
        totals.push(order.total)
    })
    order.amount = 4
    sub()
    order.amount = 5
    expect(totals).toEqual([36, 48])

    expect(mobx._isComputingDerivation()).toBe(false)
})

test("props2", function() {
    var vat = observable.box(0.2)
    var Order = function() {
        mobx.extendObservable(this, {
            price: 20,
            amount: 2,
            get total() {
                return (1 + vat.get()) * this.price * this.amount // price and amount are now properties!
            }
        })
    }

    var order = new Order()
    expect(48).toBe(order.total)
    order.price = 10
    order.amount = 3
    expect(36).toBe(order.total)
})

test("props3", function() {
    var vat = observable.box(0.2)
    var Order = function() {
        this.price = 20
        this.amount = 2
        this.total = mobx.computed(function() {
            return (1 + vat.get()) * this.price * this.amount // price and amount are now properties!
        })
        mobx.extendObservable(this, this)
    }

    var order = new Order()
    expect(48).toBe(order.total)
    order.price = 10
    order.amount = 3
    expect(36).toBe(order.total)
})

test("props4", function() {
    function Bzz() {
        mobx.extendObservable(this, {
            fluff: [1, 2],
            get sum() {
                return this.fluff.reduce(function(a, b) {
                    return a + b
                }, 0)
            }
        })
    }

    var x = new Bzz()
    var ar = x.fluff
    expect(x.sum).toBe(3)
    x.fluff.push(3)
    expect(x.sum).toBe(6)
    x.fluff = [5, 6]
    expect(x.sum).toBe(11)
    x.fluff.push(2)
    expect(x.sum).toBe(13)
})

test("extend observable multiple prop maps", function() {
    var x = { a: 1 }
    expect(() => {
        mobx.extendObservable(
            x,
            {
                b: 2,
                c: 2
            },
            {
                c: 3,
                d: 4
            }
        )
    }).toThrow(/invalid option for \(extend\)observable: c/)
})

test("object enumerable props", function() {
    var x = mobx.observable({
        a: 3,
        b: mobx.computed(function() {
            return 2 * this.a
        })
    })
    mobx.extendObservable(x, { c: 4 })
    var ar = []
    for (var key in x) ar.push(key)
    expect(ar).toEqual(["a", "c"]) // or should 'b' be in here as well?
})

test("observe property", function() {
    var sb = []
    var mb = []

    var Wrapper = function(chocolateBar) {
        mobx.extendObservable(this, {
            chocolateBar: chocolateBar,
            get calories() {
                return this.chocolateBar.calories
            }
        })
    }

    var snickers = mobx.observable({
        calories: null
    })
    var mars = mobx.observable({
        calories: undefined
    })

    var wrappedSnickers = new Wrapper(snickers)
    var wrappedMars = new Wrapper(mars)

    var disposeSnickers = mobx.autorun(function() {
        sb.push(wrappedSnickers.calories)
    })
    var disposeMars = mobx.autorun(function() {
        mb.push(wrappedMars.calories)
    })
    snickers.calories = 10
    mars.calories = 15

    disposeSnickers()
    disposeMars()
    snickers.calories = 5
    mars.calories = 7

    expect(sb).toEqual([null, 10])
    expect(mb).toEqual([undefined, 15])
})

test("observe object", function() {
    var events = []
    var a = observable({
        a: 1,
        get da() {
            return this.a * 2
        }
    })
    var stop = m.observe(a, function(change) {
        events.push(change)
    })

    a.a = 2
    mobx.extendObservable(a, {
        a: 3,
        b: 3
    })
    a.a = 4
    a.b = 5
    expect(events).toEqual([
        {
            type: "update",
            object: a,
            name: "a",
            newValue: 2,
            oldValue: 1
        },
        {
            type: "update",
            object: a,
            name: "a",
            newValue: 3,
            oldValue: 2
        },
        {
            type: "add",
            object: a,
            newValue: 3,
            name: "b"
        },
        {
            type: "update",
            object: a,
            name: "a",
            newValue: 4,
            oldValue: 3
        },
        {
            type: "update",
            object: a,
            name: "b",
            newValue: 5,
            oldValue: 3
        }
    ])

    stop()
    events = []
    a.a = 6
    expect(events.length).toBe(0)
})

test("mobx.observe", function() {
    var events = []
    var o = observable({ b: 2 })
    var ar = observable([3])
    var map = mobx.observable.map({})

    var push = function(event) {
        events.push(event)
    }

    var stop2 = mobx.observe(o, push)
    var stop3 = mobx.observe(ar, push)
    var stop4 = mobx.observe(map, push)

    o.b = 5
    ar[0] = 6
    map.set("d", 7)

    stop2()
    stop3()
    stop4()

    o.b = 9
    ar[0] = 10
    map.set("d", 11)

    expect(events).toEqual([
        {
            type: "update",
            object: o,
            name: "b",
            newValue: 5,
            oldValue: 2
        },
        {
            object: ar,
            type: "update",
            index: 0,
            newValue: 6,
            oldValue: 3
        },
        {
            type: "add",
            object: map,
            newValue: 7,
            name: "d"
        }
    ])
})

test("change count optimization", function() {
    var bCalcs = 0
    var cCalcs = 0
    var a = observable.box(3)
    var b = computed(function() {
        bCalcs += 1
        return 4 + a.get() - a.get()
    })
    var c = computed(function() {
        cCalcs += 1
        return b.get()
    })

    m.observe(c, voidObserver)

    expect(b.get()).toBe(4)
    expect(c.get()).toBe(4)
    expect(bCalcs).toBe(1)
    expect(cCalcs).toBe(1)

    a.set(5)

    expect(b.get()).toBe(4)
    expect(c.get()).toBe(4)
    expect(bCalcs).toBe(2)
    expect(cCalcs).toBe(1)

    expect(mobx._isComputingDerivation()).toBe(false)
})

test("observables removed", function() {
    var calcs = 0
    var a = observable.box(1)
    var b = observable.box(2)
    var c = computed(function() {
        calcs++
        if (a.get() === 1) return b.get() * a.get() * b.get()
        return 3
    })

    expect(calcs).toBe(0)
    m.observe(c, voidObserver)
    expect(c.get()).toBe(4)
    expect(calcs).toBe(1)
    a.set(2)
    expect(c.get()).toBe(3)
    expect(calcs).toBe(2)

    b.set(3) // should not retrigger calc
    expect(c.get()).toBe(3)
    expect(calcs).toBe(2)

    a.set(1)
    expect(c.get()).toBe(9)
    expect(calcs).toBe(3)

    expect(mobx._isComputingDerivation()).toBe(false)
})

test("lazy evaluation", function() {
    var bCalcs = 0
    var cCalcs = 0
    var dCalcs = 0
    var observerChanges = 0

    var a = observable.box(1)
    var b = computed(function() {
        bCalcs += 1
        return a.get() + 1
    })

    var c = computed(function() {
        cCalcs += 1
        return b.get() + 1
    })

    expect(bCalcs).toBe(0)
    expect(cCalcs).toBe(0)
    expect(c.get()).toBe(3)
    expect(bCalcs).toBe(1)
    expect(cCalcs).toBe(1)

    expect(c.get()).toBe(3)
    expect(bCalcs).toBe(2)
    expect(cCalcs).toBe(2)

    a.set(2)
    expect(bCalcs).toBe(2)
    expect(cCalcs).toBe(2)

    expect(c.get()).toBe(4)
    expect(bCalcs).toBe(3)
    expect(cCalcs).toBe(3)

    var d = computed(function() {
        dCalcs += 1
        return b.get() * 2
    })

    var handle = m.observe(
        d,
        function() {
            observerChanges += 1
        },
        false
    )
    expect(bCalcs).toBe(4)
    expect(cCalcs).toBe(3)
    expect(dCalcs).toBe(1) // d is evaluated, so that its dependencies are known

    a.set(3)
    expect(d.get()).toBe(8)
    expect(bCalcs).toBe(5)
    expect(cCalcs).toBe(3)
    expect(dCalcs).toBe(2)

    expect(c.get()).toBe(5)
    expect(bCalcs).toBe(5)
    expect(cCalcs).toBe(4)
    expect(dCalcs).toBe(2)

    expect(b.get()).toBe(4)
    expect(bCalcs).toBe(5)
    expect(cCalcs).toBe(4)
    expect(dCalcs).toBe(2)

    handle() // unlisten
    expect(d.get()).toBe(8)
    expect(bCalcs).toBe(6) // gone to sleep
    expect(cCalcs).toBe(4)
    expect(dCalcs).toBe(3)

    expect(observerChanges).toBe(1)

    expect(mobx._isComputingDerivation()).toBe(false)
})

test("multiple view dependencies", function() {
    var bCalcs = 0
    var dCalcs = 0
    var a = observable.box(1)
    var b = computed(function() {
        bCalcs++
        return 2 * a.get()
    })
    var c = observable.box(2)
    var d = computed(function() {
        dCalcs++
        return 3 * c.get()
    })

    var zwitch = true
    var buffer = []
    var fCalcs = 0
    var dis = mobx.autorun(function() {
        fCalcs++
        if (zwitch) buffer.push(b.get() + d.get())
        else buffer.push(d.get() + b.get())
    })

    zwitch = false
    c.set(3)
    expect(bCalcs).toBe(1)
    expect(dCalcs).toBe(2)
    expect(fCalcs).toBe(2)
    expect(buffer).toEqual([8, 11])

    c.set(4)
    expect(bCalcs).toBe(1)
    expect(dCalcs).toBe(3)
    expect(fCalcs).toBe(3)
    expect(buffer).toEqual([8, 11, 14])

    dis()
    c.set(5)
    expect(bCalcs).toBe(1)
    expect(dCalcs).toBe(3)
    expect(fCalcs).toBe(3)
    expect(buffer).toEqual([8, 11, 14])
})

test("nested observable2", function() {
    var factor = observable.box(0)
    var price = observable.box(100)
    var totalCalcs = 0
    var innerCalcs = 0

    var total = computed(function() {
        totalCalcs += 1 // outer observable shouldn't recalc if inner observable didn't publish a real change
        return (
            price.get() *
            computed(function() {
                innerCalcs += 1
                return factor.get() % 2 === 0 ? 1 : 3
            }).get()
        )
    })

    var b = []
    var sub = m.observe(
        total,
        function(x) {
            b.push(x.newValue)
        },
        true
    )

    price.set(150)
    factor.set(7) // triggers innerCalc twice, because changing the outcome triggers the outer calculation which recreates the inner calculation
    factor.set(5) // doesn't trigger outer calc
    factor.set(3) // doesn't trigger outer calc
    factor.set(4) // triggers innerCalc twice
    price.set(20)

    expect(b).toEqual([100, 150, 450, 150, 20])
    expect(innerCalcs).toBe(9)
    expect(totalCalcs).toBe(5)
})

test("observe", function() {
    var x = observable.box(3)
    var x2 = computed(function() {
        return x.get() * 2
    })
    var b = []

    var cancel = mobx.autorun(function() {
        b.push(x2.get())
    })

    x.set(4)
    x.set(5)
    expect(b).toEqual([6, 8, 10])
    cancel()
    x.set(7)
    expect(b).toEqual([6, 8, 10])
})

test("when", function() {
    var x = observable.box(3)

    var called = 0
    mobx.when(
        function() {
            return x.get() === 4
        },
        function() {
            called += 1
        }
    )

    x.set(5)
    expect(called).toBe(0)
    x.set(4)
    expect(called).toBe(1)
    x.set(3)
    expect(called).toBe(1)
    x.set(4)
    expect(called).toBe(1)
})

test("when 2", function() {
    var x = observable.box(3)

    var called = 0
    var d = mobx.when(
        function() {
            return x.get() === 3
        },
        function() {
            called += 1
        },
        { name: "when x is 3" }
    )

    expect(called).toBe(1)
    expect(x.observers.length).toBe(0)
    x.set(5)
    x.set(3)
    expect(called).toBe(1)

    expect(d.$mobx.name).toBe("when x is 3")
})

function stripSpyOutput(events) {
    events.forEach(ev => {
        delete ev.time
        delete ev.fn
        delete ev.object
    })
    return events
}

test("issue 50", function(done) {
    m._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0
    var x = observable({
        a: true,
        b: false,
        get c() {
            events.push("calc c")
            return this.b
        }
    })

    var result
    var events = []
    var disposer1 = mobx.autorun(function ar() {
        events.push("auto")
        result = [x.a, x.b, x.c].join(",")
    })

    var disposer2 = mobx.spy(function(info) {
        events.push(info)
    })

    setTimeout(function() {
        mobx.transaction(function() {
            events.push("transstart")
            x.a = !x.a
            x.b = !x.b
            events.push("transpreend")
        })
        events.push("transpostend")
        expect(result).toBe("false,true,true")
        expect(x.c).toBe(x.b)

        expect(stripSpyOutput(events)).toMatchSnapshot()

        disposer1()
        disposer2()
        done()
    }, 500)
})

test("verify transaction events", function() {
    m._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0

    var x = observable({
        b: 1,
        get c() {
            events.push("calc c")
            return this.b
        }
    })

    var events = []
    var disposer1 = mobx.autorun(function ar() {
        events.push("auto")
        x.c
    })

    var disposer2 = mobx.spy(function(info) {
        events.push(info)
    })

    mobx.transaction(function() {
        events.push("transstart")
        x.b = 1
        x.b = 2
        events.push("transpreend")
    })
    events.push("transpostend")

    expect(stripSpyOutput(events)).toMatchSnapshot()

    disposer1()
    disposer2()
})

test("verify array in transaction", function() {
    var ar = observable([])
    var aCount = 0
    var aValue

    mobx.autorun(function() {
        aCount++
        aValue = 0
        for (var i = 0; i < ar.length; i++) aValue += ar[i]
    })

    mobx.transaction(function() {
        ar.push(2)
        ar.push(3)
        ar.push(4)
        ar.unshift(1)
    })
    expect(aValue).toBe(10)
    expect(aCount).toBe(2)
})

test("delay autorun until end of transaction", function() {
    m._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0
    var events = []
    var x = observable({
        a: 2,
        get b() {
            events.push("calc y")
            return this.a
        }
    })
    var disposer1
    var disposer2 = mobx.spy(function(info) {
        events.push(info)
    })
    var didRun = false

    mobx.transaction(function() {
        mobx.transaction(function() {
            disposer1 = mobx.autorun(function test() {
                didRun = true
                events.push("auto")
                x.b
            })

            expect(didRun).toBe(false)

            x.a = 3
            x.a = 4

            events.push("end1")
        })
        expect(didRun).toBe(false)
        x.a = 5
        events.push("end2")
    })

    expect(didRun).toBe(true)
    events.push("post trans1")
    x.a = 6
    events.push("post trans2")
    disposer1()
    x.a = 3
    events.push("post trans3")

    expect(stripSpyOutput(events)).toMatchSnapshot()

    disposer2()
})

test("prematurely end autorun", function() {
    var x = observable.box(2)
    var dis1, dis2
    mobx.transaction(function() {
        dis1 = mobx.autorun(function() {
            x.get()
        })
        dis2 = mobx.autorun(function() {
            x.get()
        })

        expect(x.observers.length).toBe(0)
        expect(dis1.$mobx.observing.length).toBe(0)
        expect(dis2.$mobx.observing.length).toBe(0)

        dis1()
    })
    expect(x.observers.length).toBe(1)
    expect(dis1.$mobx.observing.length).toBe(0)
    expect(dis2.$mobx.observing.length).toBe(1)

    dis2()

    expect(x.observers.length).toBe(0)
    expect(dis1.$mobx.observing.length).toBe(0)
    expect(dis2.$mobx.observing.length).toBe(0)
})

test("computed values believe NaN === NaN", function() {
    var a = observable.box(2)
    var b = observable.box(3)
    var c = computed(function() {
        return String(a.get() * b.get())
    })
    var buf = buffer()
    m.observe(c, buf)

    a.set(NaN)
    b.set(NaN)
    a.set(NaN)
    a.set(2)
    b.set(3)

    expect(buf.toArray()).toEqual(["NaN", "6"])
})

test("computed values believe deep NaN === deep NaN when using compareStructural", function() {
    var a = observable({ b: { a: 1 } })
    var c = computed(
        function() {
            return a.b
        },
        { compareStructural: true }
    )

    var buf = new buffer()
    c.observe(newValue => {
        buf(newValue)
    })

    a.b = { a: NaN }
    a.b = { a: NaN }
    a.b = { a: NaN }
    a.b = { a: 2 }
    a.b = { a: NaN }

    var bufArray = buf.toArray()
    expect(isNaN(bufArray[0].b)).toBe(true)
    expect(bufArray[1]).toEqual({ a: 2 })
    expect(isNaN(bufArray[2].b)).toEqual(true)
    expect(bufArray.length).toBe(3)
})

test.skip("issue 65; transaction causing transaction", function(t) {
    // MWE: disabled, bad test; depends on transaction being tracked, transaction should not be used in computed!
    var x = mobx.observable({
        a: 3,
        get b() {
            return mobx.transaction(function() {
                return this.a * 2
            }, this)
        }
    })

    var res
    mobx.autorun(function() {
        res = x.a + x.b
    })

    mobx.transaction(function() {
        x.a = 2
        x.a = 5
    })
    expect(res).toBe(15)
    t.end()
})

test("issue 71, transacting running transformation", function() {
    var state = mobx.observable({
        things: []
    })

    function Thing(value) {
        mobx.extendObservable(this, {
            value: value,
            get pos() {
                return state.things.indexOf(this)
            },
            get isVisible() {
                return this.pos !== -1
            }
        })

        mobx.when(
            () => {
                return this.isVisible
            },
            () => {
                if (this.pos < 4) state.things.push(new Thing(value + 1))
            }
        )
    }

    var copy
    var vSum
    mobx.autorun(function() {
        copy = state.things.map(function(thing) {
            return thing.value
        })
        vSum = state.things.reduce(function(a, thing) {
            return a + thing.value
        }, 0)
    })

    expect(copy).toEqual([])

    mobx.transaction(function() {
        state.things.push(new Thing(1))
    })

    expect(copy).toEqual([1, 2, 3, 4, 5])
    expect(vSum).toBe(15)

    state.things.splice(0, 2)
    state.things.push(new Thing(6))

    expect(copy).toEqual([3, 4, 5, 6, 7])
    expect(vSum).toBe(25)
})

test("eval in transaction", function() {
    var bCalcs = 0
    var x = mobx.observable({
        a: 1,
        get b() {
            bCalcs++
            return this.a * 2
        }
    })
    var c

    mobx.autorun(function() {
        c = x.b
    })

    expect(bCalcs).toBe(1)
    expect(c).toBe(2)

    mobx.transaction(function() {
        x.a = 3
        expect(x.b).toBe(6)
        expect(bCalcs).toBe(2)
        expect(c).toBe(2)

        x.a = 4
        expect(x.b).toBe(8)
        expect(bCalcs).toBe(3)
        expect(c).toBe(2)
    })
    expect(bCalcs).toBe(3) // 2 or 3 would be fine as well
    expect(c).toBe(8)
})

test("forcefully tracked reaction should still yield valid results", function() {
    var x = observable.box(3)
    var z
    var runCount = 0
    var identity = function() {
        runCount++
        z = x.get()
    }
    var a = new mobx.Reaction("test", function() {
        this.track(identity)
    })
    a.runReaction()

    expect(z).toBe(3)
    expect(runCount).toBe(1)

    transaction(function() {
        x.set(4)
        a.track(identity)
        expect(a.isScheduled()).toBe(true)
        expect(z).toBe(4)
        expect(runCount).toBe(2)
    })

    expect(z).toBe(4)
    expect(runCount).toBe(2) // x is observed, so it should recompute only on dependency change

    transaction(function() {
        x.set(5)
        expect(a.isScheduled()).toBe(true)
        a.track(identity)
        expect(z).toBe(5)
        expect(runCount).toBe(3)
        expect(a.isScheduled()).toBe(true)

        x.set(6)
        expect(z).toBe(5)
        expect(runCount).toBe(3)
    })
    expect(a.isScheduled()).toBe(false)
    expect(z).toBe(6)
    expect(runCount).toBe(4)
})

test("autoruns created in autoruns should kick off", function() {
    var x = observable.box(3)
    var x2 = []
    var d

    var a = m.autorun(function() {
        if (d) {
            // dispose previous autorun
            d()
        }
        d = m.autorun(function() {
            x2.push(x.get() * 2)
        })
    })

    // a should be observed by the inner autorun, not the outer
    expect(a.$mobx.observing.length).toBe(0)
    expect(d.$mobx.observing.length).toBe(1)

    x.set(4)
    expect(x2).toEqual([6, 8])
})

test("#502 extendObservable throws on objects created with Object.create(null)", () => {
    var a = Object.create(null)
    mobx.extendObservable(a, { b: 3 })
    expect(mobx.isObservableProp(a, "b")).toBe(true)
})

test("#328 atom throwing exception if observing stuff in onObserved", () => {
    var b = mobx.observable.box(1)
    var a = mobx.createAtom("test atom", () => {
        b.get()
    })
    var d = mobx.autorun(() => {
        a.reportObserved() // threw
    })
    d()
})

test("prematurely ended autoruns are cleaned up properly", () => {
    var a = mobx.observable.box(1)
    var b = mobx.observable.box(2)
    var c = mobx.observable.box(3)
    var called = 0

    var d = mobx.autorun(() => {
        called++
        if (a.get() === 2) {
            d() // dispose
            b.get() // consume
            a.set(3) // cause itself to re-run, but, disposed!
        } else {
            c.get()
        }
    })

    expect(called).toBe(1)
    expect(a.observers.length).toBe(1)
    expect(b.observers.length).toBe(0)
    expect(c.observers.length).toBe(1)
    expect(d.$mobx.observing.length).toBe(2)

    a.set(2)

    expect(called).toBe(2)
    expect(a.observers.length).toBe(0)
    expect(b.observers.length).toBe(0)
    expect(c.observers.length).toBe(0)
    expect(d.$mobx.observing.length).toBe(0)
})

test("unoptimizable subscriptions are diffed correctly", () => {
    var a = mobx.observable.box(1)
    var b = mobx.observable.box(1)
    var c = mobx.computed(() => {
        a.get()
        return 3
    })
    var called = 0
    var val = 0

    const d = mobx.autorun(() => {
        called++
        a.get()
        c.get() // reads a as well
        val = a.get()
        if (
            b.get() === 1 // only on first run
        )
            a.get() // second run: one read less for a
    })

    expect(called).toBe(1)
    expect(val).toBe(1)
    expect(a.observers.length).toBe(2)
    expect(b.observers.length).toBe(1)
    expect(c.observers.length).toBe(1)
    expect(d.$mobx.observing.length).toBe(3) // 3 would be better!

    b.set(2)

    expect(called).toBe(2)
    expect(val).toBe(1)
    expect(a.observers.length).toBe(2)
    expect(b.observers.length).toBe(1)
    expect(c.observers.length).toBe(1)
    expect(d.$mobx.observing.length).toBe(3) // c was cached so accessing a was optimizable

    a.set(2)

    expect(called).toBe(3)
    expect(val).toBe(2)
    expect(a.observers.length).toBe(2)
    expect(b.observers.length).toBe(1)
    expect(c.observers.length).toBe(1)
    expect(d.$mobx.observing.length).toBe(3) // c was cached so accessing a was optimizable

    d()
})

test("atom events #427", () => {
    var start = 0
    var stop = 0
    var runs = 0

    var a = mobx.createAtom("test", () => start++, () => stop++)
    expect(a.reportObserved()).toEqual(false)

    expect(start).toBe(0)
    expect(stop).toBe(0)

    var d = mobx.autorun(() => {
        runs++
        expect(a.reportObserved()).toBe(true)
        expect(start).toBe(1)
        expect(a.reportObserved()).toBe(true)
        expect(start).toBe(1)
    })

    expect(runs).toBe(1)
    expect(start).toBe(1)
    expect(stop).toBe(0)
    a.reportChanged()
    expect(runs).toBe(2)
    expect(start).toBe(1)
    expect(stop).toBe(0)

    d()
    expect(runs).toBe(2)
    expect(start).toBe(1)
    expect(stop).toBe(1)

    expect(a.reportObserved()).toBe(false)
    expect(start).toBe(1)
    expect(stop).toBe(1)

    d = mobx.autorun(() => {
        expect(a.reportObserved()).toBe(true)
        expect(start).toBe(2)
        a.reportObserved()
        expect(start).toBe(2)
    })

    expect(start).toBe(2)
    expect(stop).toBe(1)
    a.reportChanged()
    expect(start).toBe(2)
    expect(stop).toBe(1)

    d()
    expect(stop).toBe(2)
})

test("verify calculation count", () => {
    var calcs = []
    var a = observable.box(1)
    var b = mobx.computed(() => {
        calcs.push("b")
        return a.get()
    })
    var c = mobx.computed(() => {
        calcs.push("c")
        return b.get()
    })
    var d = mobx.autorun(() => {
        calcs.push("d")
        return b.get()
    })
    var e = mobx.autorun(() => {
        calcs.push("e")
        return c.get()
    })
    var f = mobx.computed(() => {
        calcs.push("f")
        return c.get()
    })

    expect(f.get()).toBe(1)

    calcs.push("change")
    a.set(2)

    expect(f.get()).toBe(2)

    calcs.push("transaction")
    transaction(() => {
        expect(b.get()).toBe(2)
        expect(c.get()).toBe(2)
        expect(f.get()).toBe(2)
        expect(f.get()).toBe(2)
        calcs.push("change")
        a.set(3)
        expect(b.get()).toBe(3)
        expect(b.get()).toBe(3)
        calcs.push("try c")
        expect(c.get()).toBe(3)
        expect(c.get()).toBe(3)
        calcs.push("try f")
        expect(f.get()).toBe(3)
        expect(f.get()).toBe(3)
        calcs.push("end transaction")
    })

    expect(calcs).toEqual([
        "d",
        "b",
        "e",
        "c",
        "f",
        "change",
        "b",
        "c",
        "e",
        "d",
        "f", // would have expected b c e d f, but alas
        "transaction",
        "f",
        "change",
        "b",
        "try c",
        "c",
        "try f",
        "f",
        "end transaction",
        "e",
        "d" // would have expected e d
    ])

    d()
    e()
})

test("support computed property getters / setters", () => {
    let a = observable({
        size: 1,
        get volume() {
            return this.size * this.size
        }
    })

    expect(a.volume).toBe(1)
    a.size = 3
    expect(a.volume).toBe(9)

    expect(() => (a.volume = 9)).toThrowError(
        /It is not possible to assign a new value to a computed value/
    )

    a = {}
    mobx.extendObservable(a, {
        size: 2,
        get volume() {
            return this.size * this.size
        },
        set volume(v) {
            this.size = Math.sqrt(v)
        }
    })

    const values = []
    const d = mobx.autorun(() => values.push(a.volume))

    a.volume = 9
    mobx.transaction(() => {
        a.volume = 100
        a.volume = 64
    })

    expect(values).toEqual([4, 9, 64])
    expect(a.size).toEqual(8)

    d()
})

test("computed getter / setter for plan objects should succeed", function() {
    var b = observable({
        a: 3,
        get propX() {
            return this.a * 2
        },
        set propX(v) {
            this.a = v
        }
    })

    var values = []
    mobx.autorun(function() {
        return values.push(b.propX)
    })
    expect(b.propX).toBe(6)
    b.propX = 4
    expect(b.propX).toBe(8)

    expect(values).toEqual([6, 8])
})

test("helpful error for self referencing setter", function() {
    var a = observable({
        x: 1,
        get y() {
            return this.x
        },
        set y(v) {
            this.y = v // woops...;-)
        }
    })

    expect(() => (a.y = 2)).toThrowError(/The setter of computed value/)
})

test("#558 boxed observables stay boxed observables", function() {
    var a = observable({
        x: observable.box(3)
    })

    expect(typeof a.x).toBe("object")
    expect(typeof a.x.get).toBe("function")
})

test("iscomputed", function() {
    expect(mobx.isComputed(observable.box(3))).toBe(false)
    expect(
        mobx.isComputed(
            mobx.computed(function() {
                return 3
            })
        )
    ).toBe(true)

    var x = observable({
        a: 3,
        get b() {
            return this.a
        }
    })

    expect(mobx.isComputedProp(x, "a")).toBe(false)
    expect(mobx.isComputedProp(x, "b")).toBe(true)
})

test("603 - transaction should not kill reactions", () => {
    var a = observable.box(1)
    var b = 1
    var d = mobx.autorun(() => {
        b = a.get()
    })

    try {
        mobx.transaction(() => {
            a.set(2)
            throw 3
        })
    } catch (e) {}

    expect(a.observers.length).toBe(1)
    expect(d.$mobx.observing.length).toBe(1)
    const g = m._getGlobalState()
    expect(g.inBatch).toEqual(0)
    expect(g.pendingReactions.length).toEqual(0)
    expect(g.pendingUnobservations.length).toEqual(0)
    expect(g.trackingDerivation).toEqual(null)

    expect(b).toBe(2)
    a.set(3)
    expect(b).toBe(3)
})

test("#561 test toPrimitive() of observable objects", function() {
    if (typeof Symbol !== "undefined" && Symbol.toPrimitive) {
        var x = observable.box(3)

        expect(x.valueOf()).toBe(3)
        expect(x[Symbol.toPrimitive]()).toBe(3)

        expect(+x).toBe(3)
        expect(++x).toBe(4)

        var y = observable.box(3)

        expect(y + 7).toBe(10)

        var z = computed(() => ({ a: 3 }))
        expect(3 + z).toBe("3[object Object]")
    } else {
        var x = observable.box(3)

        expect(x.valueOf()).toBe(3)
        expect(x["@@toPrimitive"]()).toBe(3)

        expect(+x).toBe(3)
        expect(++x).toBe(4)

        var y = observable.box(3)

        expect(y + 7).toBe(10)

        var z = computed(() => ({ a: 3 }))
        expect("3" + z["@@toPrimitive"]()).toBe("3[object Object]")
    }
})

test("observables should not fail when ES6 Map is missing", () => {
    const globalMapFunction = global.Map
    global.Map = undefined
    expect(global.Map).toBe(undefined)
    var a = observable([1, 2, 3]) //trigger isES6Map in utils

    expect(m.isObservable(a)).toBe(true)

    global.Map = globalMapFunction
})

test("computed equals function only invoked when necessary", () => {
    utils.supressConsole(() => {
        const comparisons = []
        const loggingComparer = (from, to) => {
            comparisons.push({ from, to })
            return from === to
        }

        const left = mobx.observable.box("A")
        const right = mobx.observable.box("B")
        const combinedToLowerCase = mobx.computed(
            () => left.get().toLowerCase() + right.get().toLowerCase(),
            { equals: loggingComparer }
        )

        const values = []
        let disposeAutorun = mobx.autorun(() => values.push(combinedToLowerCase.get()))

        // No comparison should be made on the first value
        expect(comparisons).toEqual([])

        // First change will cause a comparison
        left.set("C")
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }])

        // Transition *to* CaughtException in the computed won't cause a comparison
        left.set(null)
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }])

        // Transition *between* CaughtException-s in the computed won't cause a comparison
        right.set(null)
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }])

        // Transition *from* CaughtException in the computed won't cause a comparison
        left.set("D")
        right.set("E")
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }])

        // Another value change will cause a comparison
        right.set("F")
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }, { from: "de", to: "df" }])

        // Becoming unobserved, then observed won't cause a comparison
        disposeAutorun()
        disposeAutorun = mobx.autorun(() => values.push(combinedToLowerCase.get()))
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }, { from: "de", to: "df" }])

        expect(values).toEqual(["ab", "cb", "de", "df", "df"])

        disposeAutorun()
    })
})

test("Issue 1092 - Should not access attributes of siblings in the prot. chain", () => {
    expect.assertions(2)

    // The parent is an observable
    // and has an attribute
    const parent = {}
    mobx.extendObservable(parent, {
        staticObservable: 11
    })

    // Child1 "inherit" from the parent
    // and has an observable attribute
    const child1 = Object.create(parent)
    mobx.extendObservable(child1, {
        attribute: 7
    })

    // Child2 also "inherit" from the parent
    // But does not have any observable attribute
    const child2 = Object.create(parent)

    // The second child should not be aware of the attribute of his
    // sibling child1
    expect(typeof child2.attribute).toBe("undefined")

    // We still should be able to read the value from the parent
    expect(child2.staticObservable).toBe(11)
})

test("Issue 1092 - We should be able to define observable on all siblings", () => {
    expect.assertions(1)

    // The parent is an observable
    const parent = {}
    mobx.extendObservable(parent, {})

    // Child1 "inherit" from the parent
    // and has an observable attribute
    const child1 = Object.create(parent)
    mobx.extendObservable(child1, {
        attribute: 7
    })

    // Child2 also "inherit" from the parent
    // But does not have any observable attribute
    const child2 = Object.create(parent)
    expect(() => {
        mobx.extendObservable(child2, {
            attribute: 8
        })
    }).not.toThrow()
})

test("Issue 1120 - isComputed should return false for a non existing property", () => {
    expect(mobx.isComputedProp({}, "x")).toBe(false)
    expect(mobx.isComputedProp(observable({}), "x")).toBe(false)
})

test("It should not be possible to redefine a computed property", () => {
    const a = observable({
        width: 10,
        get surface() {
            return this.width
        }
    })

    expect(() => {
        mobx.extendObservable(a, {
            get surface() {
                return this.width * 2
            }
        })
    }).toThrow(/'extendObservable' can only be used to introduce new properties/)
})

test("extendObservable should not be able to set a computed property", () => {
    expect(() => {
        const x = observable({
            a: computed(
                function() {
                    return this.b * 2
                },
                function(val) {
                    this.b += val
                }
            ),
            b: 2
        })
    }).toThrow(/Passing a 'computed' as initial property value is no longer supported/)
})
