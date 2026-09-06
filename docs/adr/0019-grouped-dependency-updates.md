# 0019. Grouped monthly dependency updates, never auto-merged

## Status

Accepted.

## Context

Nothing watched this repo's dependencies. That is tolerable for a side project right up until it
isn't — a Clerk or Wrangler advisory lands and the gap between "published" and "noticed" is however
long it takes someone to run `yarn outdated` by hand.

The obvious fix has two constraints peculiar to this repo. The first is that several tool versions
are pinned exact on purpose: the oxc formatter, linter, its type-aware plugin and both jsPlugins
form a wrap → sort → format fixpoint, and bumping one of them alone can leave `yarn fix`
non-convergent, with one tool re-touching what the other just wrote — the reasoning is in
[`../explanation/tooling.md`](../explanation/tooling.md). An updater that files one pull request per
package breaks exactly that invariant, and does it in a way where each individual PR looks green.

The second is `main`'s protection. Required status checks are **strict**, so a PR must be up to date
with `main` before it can merge. Merging any one PR therefore invalidates every other open one, and
each then needs a rebase and a full re-run of all three required jobs. And because merging `main` is
what deploys ([`../how-to/deploy.md`](../how-to/deploy.md)), anything merged automatically is also
something shipped to production automatically.

## Decision

[`../../.github/dependabot.yml`](../../.github/dependabot.yml) configures Dependabot for both the npm
and GitHub Actions ecosystems.

- **Dependabot, not Renovate.** Renovate's advantages here reduced to two on inspection, and both
  dissolved. Its `packageRules` express a lockstep group by name — but Dependabot's `groups` with
  explicit `patterns` do the same thing. Its auto-merge ergonomics are genuinely better — but
  auto-merge is rejected outright below, for reasons that apply to either tool. What remains is a
  GitHub App to install and a second configuration language to maintain, against a native feature
  that needs neither.
- **No auto-merge, at any update level.** Merging to `main` deploys the Worker and the SPA, so an
  auto-merged patch bump is an unattended production deploy. The post-deploy verification step would
  catch a broken pair — after it is live. A dependency bump is not urgent enough to be worth that,
  and the deploy job's own gating assumes a human decided to ship.
- **Monthly, with a limit of two open pull requests.** Under strict checks a queue that outpaces
  review does not sit idle, it accrues rebase work: five open PRs can cost five rebase rounds and
  fifteen job runs to drain. Worse, a permanently non-empty PR list is one you stop reading — and
  it is the same list the repo's actual work lives in. Two a month is a queue that gets worked.
- **The oxc toolchain is one group, named explicitly rather than inferred.** Listing the five
  packages by name — and listing that group first, since the first matching rule wins — means their
  bump always arrives as a single PR. Leaving them to fall into a shared `development` bucket would
  usually produce the same result and silently stop doing so the first time one of them ships a
  major while the others ship a minor.
- **`@axe-core/playwright` is excluded from the grouped buckets** and so always arrives alone. A
  floating axe minor ships new accessibility rules, which can fail the gate in
  [`0015-axe-e2e-gate.md`](0015-axe-e2e-gate.md) on application code that did not change. Isolated,
  a red run names its own cause; grouped with a dozen other bumps, it starts a bisect.
- **Everything else splits by production/development for minors and patches, and majors arrive
  alone.** A major is where the reading happens — a framework's migration notes deserve their own
  pull request and their own review.
- **The GitHub Actions ecosystem names the composite action's directory explicitly.** Dependabot
  scans `/.github/workflows` and a repository-root `action.yml`; the shared setup action is neither,
  so under `"/"` alone the `setup-node` and `cache` versions inside it would go unwatched while the
  workflow's own actions were updated — the worst version of a dependency bot, one that appears to
  be working.

## Consequences

- Roughly two pull requests a month, each reviewable in one sitting, and each one a deliberate
  decision to deploy. The corollary is worth stating: there are more update streams than slots, so a
  backlog drains two at a time in an order Dependabot picks, and the toolchain group is not
  prioritised among them. Raising the limit trades that against the rebase cost above.
- **Security updates are a separate mechanism and are not grouped.** Dependabot's alert-driven
  updates bypass the monthly schedule, which is the point — but they also bypass these groups, so an
  advisory against one oxc package can arrive on its own. That is the one case where the lockstep has
  to be restored by hand: bring the other four along in the same branch before merging.
- Dependabot pull requests receive no Actions secrets — Dependabot's secret store is a separate one,
  and this repo keeps nothing in it. The sync end-to-end tier therefore takes the same path a fork
  PR takes: its gate step finds no Clerk secret, every later step skips, and the job still reports
  success, which is what the required check needs. That path is exercised for real for the first
  time by these PRs.
- A bump inside the oxc group is not a rubber stamp: `yarn fix` has to be run and confirmed
  convergent before merging, because that is the failure the grouping exists to make visible.
