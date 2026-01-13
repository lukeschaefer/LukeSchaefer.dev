---
title: "About HN.zip"
description: "This post is an example of how to add a cover/hero image"
publishDate: "15 November 23"
updatedDate: "01 October 24"
tags: ["zip"]
---

A year ago I built [hn.zip](https://hn.zip) - a Hacker News proxy site that prioritizes speed over everything else. Jump on it and see how quickly it loads - especially clicking on links.

---

The reason I built the site was simply because I often would browse HN on the NYC Subway - which doesn't have cell connection inside the tunnels. This site aggressively precaches the top 10 comments from the entire front page, so that you can continue to browse, even without internet access.

It also takes advantage of PWA Workers so that it can be loaded in complete absense of internet connection, returning whatever data it has cached.

---

It's far from perfect, and not anything I really expect anyone else to use - but it does its job!