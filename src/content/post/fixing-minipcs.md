---
title: "Fixing MiniPCs.zip"
description: "This post is an example of how to add a cover/hero image"
publishDate: "10 September 26"
updatedDate: "10 September 26"
tags: ["zip"]
---

    A few months back I launched a little (mini?) project at [MiniPCs.zip](https://MiniPCs.zip). I was looking to purchase a Mini PC to use as a living room gaming device (like a budget Steam Machine) and was struggling to find the best deal. I ended up scraping the Amazon results and building a [diskprices-like](https://diskprices.com) tool - I wrote about it [here](/posts/pareto-pcs/).

![](/mini-pcs-old.png)

Anyway, in the last week I completely redesigned the application based on a lot of feedback I got.

1) I got carried away with the concept of the Pareto Frontier, which *to be fair*, I still think is very cool. But it's not a very readable way to present the data.
2) People are interested in Mini PCs for a variety of use cases (gaming, media server, home lab, office) - and knowing how to find the best one for the task should be front and center
3) MiniPCs on Amazon churn *super fast* which I didn't expect. My data was stale half the time, even though I scan every day. Partially due to a pruning bug - but also because ASINs are reassigned to different devices, which threw off my system

The result is below, and I think it's much more understandable:

![](/mini-pcs-fixed.png)