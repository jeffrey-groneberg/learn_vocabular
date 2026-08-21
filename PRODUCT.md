# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, and Vite PWA with a small Node.js public gateway and a
separate internal Node.js Speech API. The application is deployed as Azure
Container Apps and provisioned with Terraform.

## Users

The primary user is one learner aged 9-13 using an iPhone. The learner needs to
practise teacher- or family-defined English/German words and sentences independently.
The parent maintains the deployment and family access code from one Mac.

## Product Purpose

Help the learner remember bilingual words and sentences by combining listening,
pronunciation, recall, and writing in one short practice flow. Success means
the learner can use the app without adult guidance, receive specific and calm
feedback, and repeat items that need more work.

## Positioning

The product assesses a known answer rather than conducting an open-ended AI
conversation: each exercise joins a canonical translation, scripted
pronunciation assessment, recognized-answer matching, and deterministic writing
evaluation while keeping the learner's library and progress on the iPhone.

## Operating Context

- The learner creates or edits English/German exercise sets on the iPhone.
- Practice runs in English-to-German, German-to-English, or mixed direction.
- Every item starts as an audio-only cue with replayable listening. Complete
  written answers stay hidden until pronunciation and writing are complete,
  while retry feedback can identify exact problem words.
- English-to-German plays English, assesses spoken English, then collects the
  German translation and English spelling.
- German-to-English plays German, assesses spoken English, then collects the
  English spelling.
- Speaking and every required written answer repeat until they are exactly
  correct or the learner explicitly skips the item.
- Results measure first-try performance only; retried and skipped items are
  both marked as needing practice and remain distinguishable item by item.
- Both modes identify exact problem words and sounds. Learn mode also reports
  each pronunciation check below the threshold; Test mode withholds numeric scores.
- For pronunciation errors and recognized-answer mismatches, the learner can
  hear the complete English model answer at normal or slower pace before the
  next attempt.
- Speech operations require a network connection; editing and locally cached
  app-shell use remain available offline.
- A family access code unlocks a fixed 30-day browser session.

## Capabilities and Constraints

- US English (`en-US`) and German (`de-DE`) neural text-to-speech for the
  direction-specific audio cue, plus normal and slower English model playback
  after a pronunciation retry.
- Scripted English (`en-US`) Azure Speech Pronunciation Assessment with a strict
  `80/100` threshold for overall pronunciation, accuracy, fluency,
  completeness, available prosody, and every word in every direction.
- Individual sound scores are diagnostic evidence, not a pass gate. When a word
  fails, the weakest sound can select a child-friendly coaching tip with a
  familiar example and concrete mouth or tongue guidance.
- Exact spelling passes. Damerau-Levenshtein distance one receives specific
  minor-typo feedback but still requires another attempt; the canonical answer
  stays hidden until the item is correct or skipped.
- Exercise sets, preferences, attempts, progress, and a bounded generated-audio
  cache for cue and model-playback variants stay in IndexedDB on the learner's
  device.
- Microphone audio is transient and never persisted. Generated replay audio is
  cached only on the learner's device and evicted least-recently-used.
- No points, streaks, leaderboards, social comparison, cloud sync, or multiple
  learner profiles.
- No learner account. The custom family code has no enforced strength rule.
- Five failed access attempts from one source within 15 minutes cause a
  30-minute block.
- The public web gateway is the only public application route; the Speech API is
  internal to the Azure Container Apps environment.
- Azure resources are created by local-state Terraform and deployed only from
  the parent's Mac. There is no CI/CD pipeline.

## Brand Commitments

- Working name: **Vocabulary Voice Tutor**. No final product name, logo, or
  visual brand asset has been supplied.
- Voice is focused, encouraging, specific, and never judgmental or childish.
- Feedback invites another attempt instead of labeling the learner.

## Evidence on Hand

- The repository contains no existing UI, logo, illustration, photography, or
  visual system.
- Product and architecture decisions are recorded in the approved session plan.
- No claims, testimonials, usage statistics, or educational outcomes may be
  invented.

## Product Principles

1. Make the next action obvious.
2. Explain what to retry without exposing the answer too early.
3. Keep learner content and generated cues local, and microphone audio out of
   storage.
4. Prefer deterministic correctness rules over unnecessary AI judgment.
5. Respect a 9-13-year-old learner without gamification pressure.

## Accessibility & Inclusion

- Mobile-first for current iPhone Safari and Add to Home Screen.
- Support safe areas, large touch targets, strong contrast, visible focus,
  reduced motion, and no hover-only behavior.
- Do not rely on color alone for correctness.
- Provide clear microphone-permission, recording, processing, offline,
  lockout, session-expiry, and service-error states.
- Preserve German umlauts and `ß` and use locale-aware comparisons.
