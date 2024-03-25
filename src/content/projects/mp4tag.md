---
title: 'MP4Tag.com'
available: true
description: 'none'
pubDate: 'December 2016'
heroImage: '/hero/mp4tag.png'
---

In college I listened to music with a free <a href="https://pandora.com">Pandora</a> account. In my Junior year (2013-2014) I decided to put my newfound knowledge in Web Development to practical use. I created a Chrome extension that would view middleman the network requests on the Pandora site and download them to my machine automatically... Nowadays I pay for a Youtube Music subscription, and I never published this code.

## The easy part

It only took a day or two to get the basic functionality working - streaming was less complicated then, I'm sure Spotify doesn't expose simple MP4 files in the same way. However, there was an obvious issue - files were downloaded with a UUID as their filename, and no metadata. Not very usable if I wanted to have a local replica of my Pandora stations.

## The hard part

In order to download these files with proper metadata, I had to scrape the page at the time of download - and edit the binary in Javascript to include this data. Binary manipulation in JS was not quite as common as it is now, and it's not too common now either. But it was a fun experience looking up the MP4 spec, and implementing it to the best of my abilities. I used a now redundant library jDataView, and exercised a lot of trial and error. Eventually it worked, and I was very proud of myself.

## Publishing

I obviously did not want to publish my pirating tool, so I split out the MP4 editing functionality into its own library - and built a small website around it. At some point I upgraded it to Typescript, but it still isn't reliable for any other tasks than editing the basic metadata. 