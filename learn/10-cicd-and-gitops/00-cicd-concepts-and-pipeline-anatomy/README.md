# CI/CD Concepts and Pipeline Anatomy

## Why this matters

Before you write a single line of workflow YAML, you need a mental model
of what a delivery pipeline *is* and the vocabulary the rest of this track
uses. "CI/CD" gets thrown around as one word, but it hides three distinct
ideas — continuous integration, continuous delivery, and continuous
deployment — that differ in exactly one place: how far automation reaches
before a human has to say "go." Getting these distinctions right now is
what keeps you from building a pipeline that either terrifies you (deploys
to production with no gate) or wastes its own point (a "pipeline" that
still needs six manual steps to ship).

## Concepts

### Continuous integration (CI): merge early, verify automatically

Continuous integration is the practice of merging every developer's work
into a shared main branch frequently — many times a day — and having an
automated system build and test each change as it lands. The goal is to
catch integration problems (your change compiles alone but breaks when
combined with a teammate's) within minutes instead of at a painful
end-of-sprint "merge day." In track 08 you learned the *mechanics* of
merging: feature branches, rebasing to keep history clean, and opening a
pull request. CI is what runs automatically *on* that pull request — the
build-and-test job whose green checkmark tells reviewers the change is
safe to merge. CI ends at "the code is proven to build and pass tests";
it says nothing about shipping.

### Continuous delivery vs. continuous deployment (the CD ambiguity)

"CD" is two different things and people use it loosely:

- **Continuous delivery** means every change that passes CI is
  automatically built, packaged, and made *ready to release* — pushed to a
  registry, deployed to a staging environment — but a **human approves**
  the final promotion to production. The release is one button-click away,
  always; a person still clicks the button.
- **Continuous deployment** removes that last human gate: every change that
  passes all automated checks goes **all the way to production with no
  manual approval**. This demands very high confidence in your automated
  tests and strong deployment strategies (canary, automatic rollback),
  because there is no human backstop.

The difference is exactly one manual approval step. Most teams do
continuous *delivery* to production and true continuous *deployment* only
to lower environments. Throughout this track, "CD" means delivery unless
stated otherwise, and module 07 covers the protected-environment approval
gate that draws the line between them.

### Pipeline anatomy: stages, jobs, steps

A pipeline is an ordered sequence of **stages**, each a logical phase of
getting code to production. A common shape:

```
 commit ─▶ [ build ] ─▶ [ test ] ─▶ [ package ] ─▶ [ deploy-staging ] ─▶ (approval) ─▶ [ deploy-prod ]
```

- **build** — compile the code / produce artifacts.
- **test** — run unit and integration tests; this is the gate CI lives at.
- **package** — build the deployable unit (for us, a container image) and
  push it to a registry.
- **deploy** — roll the new version out to an environment.

Stages run in order; a later stage only runs if earlier ones passed
(**fail-fast** — module 02). In GitHub Actions the concrete units are
*jobs* (which can run in parallel or depend on each other) made of *steps*
(individual commands or actions); module 01 maps this vocabulary onto
Actions precisely. The key idea is *gating*: each stage is a checkpoint,
and a red checkpoint stops everything downstream.

### Triggers: what starts a pipeline

A pipeline doesn't run continuously — it's *triggered* by an event:

- **push** to a branch (e.g. a merge to `main` triggers a deploy).
- **pull request** opened/updated (triggers the CI build-and-test that
  gates the merge — this is the CI half wired to track 08's PR workflow).
- **tag** creation (e.g. pushing a `v1.4.0` tag triggers a release build —
  ties to the semver tagging strategy in module 03).
- **schedule** (cron — nightly builds, dependency scans).
- **manual dispatch** (a human clicks "Run workflow", optionally with
  inputs) and **workflow_call** (one workflow invoked by another — module
  01's reusable workflows).

Choosing the right trigger is a real design decision: too broad (build on
every push to every branch) burns CI minutes and clutters your registry
(a cost pitfall track 07's module 08 flagged); too narrow and changes slip
through ungated.

### Artifacts and the "build once, deploy many" rule

An **artifact** is the output of a build that later stages consume — a
compiled binary, a test report, and above all the **container image**. A
foundational rule: **build the artifact once, then promote that exact same
artifact through every environment.** You do *not* rebuild the image for
staging and again for production. If you rebuild, you can't guarantee the
production image is bit-for-bit what you tested in staging (a dependency
could have changed, a base image could have been updated). Instead you
build one immutable image, tag it with something unique and traceable (the
commit SHA — module 03), and the *same* tag flows from staging to
production. This is why "tag by SHA, not `latest`" (from track 07's
module 08) matters beyond just triggering rollouts: it's what makes an
artifact a stable, promotable unit.

### Environments and promotion

An **environment** is a named deployment target with its own config,
secrets, and often its own approval rules — typically `dev` → `staging` →
`production`. A change is **promoted** from one to the next as confidence
grows. Environments differ only in *configuration* (which database, which
replica count, which domain), never in the artifact itself. GitHub Actions
models this with **Environments** (repo settings) that can carry
environment-specific secrets and *required reviewers* — the manual gate
that turns continuous deployment back into continuous delivery for
production (module 07). Keep the mental separation clean: the image is the
same everywhere; only the environment's config and gates differ.

### Push-based CI/CD vs. pull-based GitOps (the arc of this track)

There are two fundamentally different ways the deploy stage reaches your
cluster:

- **Push-based** (what track 07's module 08 built): the pipeline runs
  *outside* the cluster, authenticates *into* it, and pushes changes
  (`kubectl set image`, `helm upgrade`). The cluster is a passive target;
  the pipeline holds cluster credentials and initiates every change.
- **Pull-based / GitOps** (modules 05-06): a controller running *inside*
  the cluster watches a Git repo and continuously *pulls* the declared
  state into the cluster. The pipeline's job ends at "commit the desired
  state to Git"; the in-cluster controller does the applying. No external
  system holds cluster credentials, and the cluster self-heals back toward
  Git if it drifts.

This track walks that exact arc: master push-based CI/CD first (modules
01-04), then adopt pull-based GitOps (05-06). Neither is strictly "better"
everywhere, but understanding *why* the industry moved toward pull-based
for Kubernetes deployment is the conceptual spine of this whole track.

## Command reference

This module is conceptual — there are no cluster commands yet. The
"commands" here are the vocabulary and the trigger/event names you'll
write in YAML from module 01 onward.

| Term / trigger | What it means | Where it shows up later |
|---|---|---|
| CI (continuous integration) | Auto build+test every merged change | Module 02 (tests gating PRs) |
| Continuous delivery | Auto-ready to release, human approves prod | Module 07 (required reviewers) |
| Continuous deployment | Fully automated to prod, no human gate | Module 06 (needs canary + auto-rollback) |
| Stage | A logical pipeline phase (build/test/deploy) | Module 01 (jobs), 02, 03, 04 |
| Artifact | A build output later stages consume | Module 03 (the container image) |
| `on: push` | Trigger: a commit was pushed to a branch | Module 01, 03 (deploy on merge to main) |
| `on: pull_request` | Trigger: a PR was opened/updated | Module 02 (the gating CI run) |
| `on: workflow_dispatch` | Trigger: a human manually runs it | Module 01 (manual deploys) |
| `on: workflow_call` | Trigger: another workflow invoked this one | Module 01 (reusable workflows) |
| Environment | A named deploy target with its own config/gates | Module 07 (protected environments) |
| Promotion | Moving the *same* artifact to the next environment | Module 04, 08 (capstone) |
| Push-based delivery | Pipeline reaches into the cluster and applies | Track 07 module 08; recapped module 04 |
| Pull-based / GitOps | In-cluster controller reconciles from Git | Modules 05, 06 |

## Hands-on exercises

These are analysis and reflection exercises — the goal is to lock in the
vocabulary before you start writing YAML in module 01. Write your answers
down; don't just think them.

1. **Classify your track-07 pipeline.** Re-read what track 07's module 08
   built (build image → push to ACR → `kubectl set image` on push to
   `main`). Write one sentence classifying it: is it CI, continuous
   delivery, or continuous deployment? Is it push-based or pull-based?
   Justify each label in a few words.

2. **Draw the pipeline.** On paper, draw the stage diagram for an app that:
   on a PR runs tests; on merge to `main` builds an image, pushes it, and
   deploys to staging automatically; and deploys to production only after
   a human approves. Label each stage, mark the trigger for each, and
   circle the one manual gate. Which CD flavor is this?

3. **Pick triggers.** For each of these, name the single most appropriate
   trigger (`push` to a branch, `pull_request`, `tag`, `schedule`, or
   `workflow_dispatch`): (a) run the test suite to gate a merge; (b) cut a
   versioned release; (c) a nightly security scan; (d) a one-off manual
   redeploy of the current version; (e) auto-deploy to staging when a
   change lands on `main`. Explain any you're unsure about.

4. **Reason about "build once".** Suppose a pipeline rebuilds the container
   image separately for staging and for production, each time from the
   same commit. Describe one concrete, realistic way the two images could
   end up different despite identical source, and why that undermines the
   whole point of having tested in staging. (Hint: think about what a
   `Dockerfile`'s base image or a `RUN apt-get install` pulls in.)

5. **Environments vs. artifacts.** List three things that legitimately
   differ between a staging and a production deployment of the *same*
   image, and three things that must *not* differ. Be specific (e.g.
   "database connection string" vs. "the application binary").

6. **Push vs. pull, in your own words.** Without looking back at the
   concepts section, write 3-4 sentences explaining the difference between
   push-based CI/CD and pull-based GitOps, specifically: where the deploy
   logic runs, who holds the cluster credentials, and what happens if
   someone manually changes the cluster out-of-band. Then re-read the
   concept to check yourself — this is the idea the back half of the track
   is built on.

7. **Spot the continuous-deployment risk.** A team switches from
   continuous *delivery* to true continuous *deployment* to production
   (removing the manual approval) but changes nothing else about their
   pipeline. Name the two capabilities from later in this track they'd
   need *first* to make that safe, and one sentence on why each.

## Independent challenge

No commands here — this is a design exercise drawing on this module plus
track 07's module 08 and track 08's PR workflow. Take a small application
you already have (or invent a realistic one) and write a one-page,
prose-only "delivery design doc" for it: define the environments it needs
and how a change is promoted through them; specify the trigger for each
pipeline stage (what runs on a PR, what runs on merge to `main`, what — if
anything — runs on a version tag); decide explicitly whether production is
continuous *delivery* (human gate) or continuous *deployment* (no gate)
and justify the choice given the testing you'd realistically have;
identify the single immutable artifact that flows through every
environment and the tag scheme that keeps it traceable; and state whether
the deploy will be push-based or pull-based, naming which later module of
this track will implement it. Write no YAML — the point is to prove you
can reason about a pipeline's shape before you can build one, the same way
you'd sketch infrastructure before writing Terraform (track 09).

<details>
<summary>Stuck? One hint</summary>

Work backwards from the production gate. Decide first whether a human
clicks "deploy to prod" or not — that single decision (delivery vs.
deployment) cascades into everything else: if there's no human gate, your
test stage and your deployment strategy have to be strong enough to be the
*only* backstop, which pulls in module 02 (tests) and module 06 (canary +
auto-rollback). If there *is* a gate, you can tolerate weaker automation
because a person is the final check. Everything else — triggers,
environments, the immutable artifact — hangs off that spine.

</details>

## Common mistakes & troubleshooting

- **Conflating continuous delivery and continuous deployment.** They
  differ by exactly one manual approval. Saying "we do CD" without
  specifying which one hides whether a human gates production — the single
  most important safety property of the pipeline.
- **Rebuilding the artifact per environment.** Rebuilding for staging and
  again for production breaks the "build once, promote the same artifact"
  rule and means you never actually tested the production image. Build
  once, tag immutably, promote that tag.
- **Treating `latest` as an artifact identity.** `latest` is a moving
  pointer, not a stable artifact reference. You can't promote or roll back
  a pointer that keeps changing under you (module 03 goes deep on this;
  track 07's module 08 already showed it silently breaks rollouts).
- **Triggering everything on every push to every branch.** Broad triggers
  burn CI minutes and clutter your registry with images no one deploys.
  Match the trigger to the stage's purpose (PR → test; merge to `main` →
  deploy).
- **Assuming "pipeline" means "fully automated to production".** A pipeline
  can be entirely CI (test-only) or stop at staging. Automation reaching
  production is a deliberate choice with prerequisites, not a default.
- **Putting environment differences into the image.** If your image
  contains a hard-coded staging database URL, it isn't promotable.
  Configuration belongs to the environment (ConfigMaps/Secrets/env vars),
  never baked into the artifact.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence each, distinguish continuous integration, continuous
   delivery, and continuous deployment. What is the single thing that
   differs between the last two?
2. What is an "artifact" in a pipeline, and what does the "build once,
   deploy many" rule say you must *not* do with it?
3. Name four distinct pipeline triggers and give a realistic use for each.
4. What is the difference between an *environment* and an *artifact*, and
   what is allowed to differ between two environments running the same
   artifact?
5. Explain push-based CI/CD vs. pull-based GitOps in terms of where the
   deploy logic runs and who holds cluster credentials.
6. Classify track 07's module-08 pipeline on both axes (CI/delivery/
   deployment, and push/pull) and justify each label.
7. A team removes the manual approval before production, moving from
   continuous delivery to continuous deployment. Why is a strong automated
   test suite and a canary/rollback strategy a *prerequisite* rather than
   a nice-to-have for that change?

<details>
<summary>Show answers</summary>

1. **CI** automatically builds and tests every change as it's merged, to
   catch integration problems early. **Continuous delivery** additionally
   makes every passing change automatically ready to release (packaged,
   deployed to staging) but a human approves the final promotion to
   production. **Continuous deployment** removes that human approval —
   every passing change goes all the way to production automatically. The
   single difference between the last two is the manual approval gate
   before production.
2. An artifact is the output of a build that later stages consume — for us,
   the container image. "Build once, deploy many" says you must *not*
   rebuild the artifact separately for each environment; you build it once
   and promote the exact same immutable artifact through staging and
   production, so what runs in prod is bit-for-bit what you tested.
3. For example: `push` to a branch (deploy on merge to `main`);
   `pull_request` (run tests to gate a merge); `tag` (cut a versioned
   release); `schedule`/cron (nightly build or security scan);
   `workflow_dispatch` (a manual one-off run). Any four with sensible uses.
4. An environment is a named deploy target (dev/staging/prod) with its own
   config, secrets, and gates; the artifact is the built image itself.
   Between environments, *configuration* may differ — connection strings,
   replica counts, domain names, secrets — but the artifact (the image)
   must be identical.
5. In push-based CI/CD the deploy logic runs *outside* the cluster in the
   pipeline, which holds cluster credentials and reaches in to apply
   changes. In pull-based GitOps a controller runs *inside* the cluster,
   holds no external credentials, and continuously pulls the desired state
   from a Git repo — the pipeline only commits to Git.
6. It is **continuous deployment** (a push to `main` goes straight to the
   cluster with no human approval) and **push-based** (the workflow runs on
   a GitHub runner, authenticates into AKS, and runs `kubectl set image`
   itself). If you argued it's closer to "delivery" because merging *is*
   the human gate, that's a defensible nuance — the key is that nothing
   gates the deploy *after* merge.
7. Because in continuous deployment there is no human backstop — the
   automated checks are the *only* thing standing between a bad commit and
   production. A strong test suite is what catches the bad change before it
   ships, and a canary/auto-rollback strategy is what limits and undoes the
   damage of anything the tests miss. Without both, removing the human gate
   just means bad changes reach all users faster.

</details>

## Next

[01-github-actions-deep-dive](../01-github-actions-deep-dive/README.md) —
turn this vocabulary into real workflow YAML: jobs, steps, runners,
matrix builds, reusable workflows, and environments.
