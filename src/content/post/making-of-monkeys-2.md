---
title: "Making of Monkeys.zip (PART TWO)"
description: "How monkeys.zip was built"
publishDate: "1 May 25"
tags: ["monkeys"]
---

If you haven't read [PART ONE](/posts/making-of-monkeys) - take a look, that one goes more into the backend, while this post is a deep-dive specifically into monkey names (I promise it's at least a little interesting).

![Monkeys](/monkeys-hero.png)

## Monkey Names

Every monkey in [monkeys.zip](https://monkeys.zip) has a unique name, like [Pinzo Dunkins](), or [Luldy Pappington](https://monkeys.zip/m/luldy-pappington). The name generation is simple enough, with a handful of handcrafted prefixes and suffixes that get randomly merged:

![Name Generation](/name_generation.png)

However, there's something **much** more special about names. These names aren't just for display purposes, they in fact are the primary unique identifier for monkeys - even **encoding monkey coordinates** into the actual name! This means that:

1) We can have clean monkey-name based URLs, without coordinates
2) We can load monkey metadata from the name, without needing the backend to respond

Solving this in a satisfactory way took way longer than expected, and the result makes it seem as if zero work went into it, which I guess counts as a success.

### Coordinates --> Monkey Name

With the above system, we have over 2.7 million available monkey names - more than enough to have no duplicates within a 1024 x 1024 square - outside of this square, we start appending overflow suffixes to the name.

If we were to naively distribute these monkey names across this square, (EG by incrementing an index and pulling from our name lists) nearby monkeys might have very similar names - **Labobu Tringo** might sit right next to **Labobu Tringson**, and on and on. What we need is a way to (reversably) hash coordinates, so that nearby coordinates have very different results. Here's what I eventually settled on:

![Coordinates to Name](/coordinates-to-name.png)

First, we take the X and Y coordinates and convert them both to positive integers. At first I overengineered this, and implemented some sort of spiral encoding, but simply zig-zagging positive and negative numbers was far simpler.

Next, we pack these two 10-bit numbers into a single 20-bit number - then we perform a [Feistal Cipher](https://en.wikipedia.org/wiki/Feistel_cipher) on it. This Cipher was a lifesaver - initial versions of this used my own shooting-from-the-hip code where I mixed the bits up in some predetermined way - but the results were never distributed sufficiently. 

:::note
Coming up with a novel solution to this problem is like a very, very low stakes version of rolling your own crypto. As someone who never really otherwise thinks about hashing, prime numbers, and bitwise math, it was extremely fun to play with. But if instead of monkey names, I was hashing passwords, this post would probably be a very sad postmortem.
:::

However, while this encoded result is nicely distributed across the integer space (20 bits) - there was one problem remaining - in that my monkey-name space was actually about *22 bits*. If I naively mapped my encoded result to monkey names, there would be entire prefixes that **never appeared**! I *could* change my name lists so that it exactly fits in 20 bits, but I liked all the names I had.

I'm a little embarrassed how long it took me to figure out what to do here - but after munching on it for a while, the answer was extremely simple:

<center>`const fitResult = (encodedResult * 1572869) % totalCombos;`</center>

By using multiplying against a large prime number, we can shuffle our (already nicely distributed) encoded result along the entire space of monkey names. 

Lastly, we pull from our monkey-name-part arrays based on our final result, and get a name!

### Monkey Name --> Coordinates

Since every step listed above is completely reversible, every step just has to be performed backwards to obtain coordinates from a monkey name! However there was one small mistake that was caught right before launch!

| Prefix | Suffixes |
| ---    |  ----    |
| Ba     |  bonky   |
| Babo   |  rilla   |
| Na     |  nky     |
| Pa     |  dson    |

If these prefixes aren't very carefully curated, names like *Babonky* are ambiguous! Is it `babo-nky` or `ba-bonky`. And of course... making sure monkey names didn't wind up being slurs required careful editing of this table.

-----

PART THREE will be **coming soon**! Here we'll talk more about the frontend, and how we render the monkeys to be (somewhat) performant! Follow me at [@LukeSchaef](https://x.com/LukeSchaef) to see when that's posted.