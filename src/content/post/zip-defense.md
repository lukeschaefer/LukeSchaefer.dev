---
title: "In defense of the .zip TLD"
description: "I am unbiased in this."
publishDate: "29 Jan 26"
tags: ["zip"]
---

I recently released a small (infinite) [word game](https://words.zip/) which had the pleasure of getting some good exposure from Gizmodo in [this article]():

![Article Screenshot](/gizmodo-article.png)

The headline leans into a phallic imagery angle that I didn't really intend, but any publicity is good publicity! I was very appreciative of the (indecent) exposure, and got a decent bump in traffic as a result.
  
   **There was, however, a paragraph which I took personal afront to**:

> It’s also notable for using the .zip domain, which—despite what one might assume—is not exclusively for phishing attacks based around fooling people who believe they’re downloading a .zip file (see: when Google opened registrations for the domain in 2023, multiple security researchers and companies condemned the idea, warning that people generally associate “.zip” with a file type, not a top level domain).

---

Now I might not be the most unbiased voice in this crowd, I happen to have a small horde of `.zip` domains; [monkeys.zip](monkeys.zip), [words.zip](words.zip), [hn.zip](hn.zip) and a dozen or so more for upcoming projects... But I think .zip has gotten a bad rap. Let's look over some of the 'controversy' and I'll be a lone voice of support for this poor misunderstood TLD.

## Why do people think .zip TLDs are dangerous?

When the .zip TLD was opened back in 2023, it was met with widespread disdain from a number of Web Security researchers & bloggers. Within a week,it was just a fact that .zip was bad - and everyone had their own little demo to prove it. 

- https://www.ghacks.net/2023/05/15/googles-zip-top-level-domain-is-already-used-in-phishing-attacks/
- https://www.threatdown.com/blog/zip-domains-a-bad-idea-nobody-asked-for/
- https://redcanary.com/blog/threat-detection/google-zip-domains/
- https://medium.com/@bobbyrsec/the-dangers-of-googles-zip-tld-5e1e675e59a5


Let's walk through the reasons or potential attack-vectors associated with .zip, and see if any hold actual light:

## Threat #1 - You can be linked to something you didn't expect

In [this article](https://medium.com/@bobbyrsec/the-dangers-of-googles-zip-tld-5e1e675e59a5) from Bobbyr, the author argues that .zip opens up a new attack where one can click a link expecting to arrive at one place, and instead arrive at another.

![zip image](/zip-link.png)

A very impressive and clever demo - where the author sneaks in an '@' symbol into the URL, and utilizes fake fowardslash - so that only the portion after it is the hostname, even though 'github.com' appeared earlier in the URL. However, I think I can one-up this trickery with some trickery of my own. Which one of these links is the real one?

[wikipedia.com](https://www.youtube.com/watch?v=dQw4w9WgXcQ) or [evil-sneaky-domain.zip](https://www.youtube.com/watch?v=dQw4w9WgXcQ).

That's right! Neither of them! Because on the Web, we can make links say anything. This has been a feature of HTML for [30+ years](https://www.ietf.org/rfc/rfc1866.txt). 

Now the author implies it's worse an emails because one could "change the size of the @ operator to a size 1 font, [making it] visually non-existent for the user, but still present as part of the URL.

However, this is of course silly... if in my email client I can change the size of my text, you'd better believe I can do this more easily:

![I trick my dad](/evil-email.png)

## Threat #2 - .zip is a file extension and now people will be confused

Another vague threat that is levied against adoption of the .zip TLD can be exemplified from this segment of [this article](https://www.threatdown.com/blog/zip-domains-a-bad-idea-nobody-asked-for/):

> Domain names and filenames are not the same thing, not even close, but both of them play an important role in modern cyberattacks, and correctly identifying them has formed part of lots of basic security advice for a long, long time.

The argument here is that domain names should never look like file names, otherwise everyone will get confused. This argument holds more merit than the previous, but not by much. For starters, even `.com` was widely used [file extension](https://en.wikipedia.org/wiki/COM_file) for decades, and some [modern software](https://gaussian.com/gaussview6/) uses it as well. 

The truth of the matter is that *anything* can have *any* filename extension. I would sooner argue that the entire concept of filename extensions are the ones to be considered harmful, than a TLD which collides with the extension namespace.

## Threat #3 - unintentional linkification

This is the most relevant one for sure. Some software automatically 'linkifies' any text that looks like it should be a link, so when you write "go to google.com" - the text editor swaps in "go to [google.com](https://google.com)". This opens up an attack where you try to tell your friend "hey go to my drive and download [weddingpictures.zip](weddingpictures.zip)" and wind up linking them to a phishing site.

However, I don't like linkification too much, and I think the user should be in greater control on whether they want to link to something or not. Even still, check out this matrix of linkification:

| Platform        | https://luke.zip | luke.zip | removable |
|-----------------|------------------|----------|-----------|
| discord         | YES              | NO       | YES       |
| reddit          | YES              | NO       | YES       |
| twitter         | YES              | YES      | NO        |
| gmail           | YES              | NO       | NO        |
| google docs     | YES              | NO       | YES       |
| whatsapp        | YES              | YES      | NO        |

It seems a lot of linkifiers either aren't updated to include .zip or have intentionally decided not to - see this Google Docs example:

----

