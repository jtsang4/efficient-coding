# Product Decision Checklist

Use this checklist during the completeness check phase of initialization (Round 4), and when
running review mode. Not every item needs to be addressed — the goal is to make sure nothing
important was accidentally overlooked.

For each uncovered area, briefly mention it to the user and ask if they want to address it now
or mark it as a pending decision.

## Core Product

- [ ] **Core problem** — Is it clear what problem this solves?
- [ ] **Target user** — Is it clear who this is for?
- [ ] **Core scenarios** — Are the 2-3 most important user journeys described?
- [ ] **Acceptance criteria** — Do core scenarios have concrete "done" conditions?
- [ ] **Scope boundaries** — Is it clear what this project is NOT?

## User Experience

- [ ] **Entry point** — How does a user first encounter/start using this?
- [ ] **Core interaction flow** — Is the main user journey walkable step by step?
- [ ] **Empty states** — What does the user see before there's any data?
- [ ] **Error states** — What happens when things go wrong?
- [ ] **Loading states** — Any operations that take noticeable time?

## Data

- [ ] **Core entities** — What are the main "things" in the system and how do they relate?
- [ ] **Data source** — Where does data come from? (user input, import, API, etc.)
- [ ] **Data volume** — Any expectations about scale?
- [ ] **Data deletion** — Can users delete their data? Soft or hard delete?
- [ ] **Data ownership** — Who owns the data? Privacy implications?

## Technical

- [ ] **Tech stack** — Frontend, backend, database choices made?
- [ ] **Authentication** — How do users log in? What auth model?
- [ ] **Authorization** — Different user roles or permissions?
- [ ] **Deployment** — Where will this run? Any infra constraints?
- [ ] **Third-party services** — Any external APIs or services needed?

## Non-Functional (Often Forgotten)

- [ ] **Performance** — Any specific speed/responsiveness requirements?
- [ ] **Accessibility** — Any a11y requirements?
- [ ] **SEO** — Does this need to be discoverable by search engines?
- [ ] **Internationalization** — Multiple languages needed?
- [ ] **Offline support** — Does it need to work without internet?
- [ ] **Mobile** — Responsive web? Native app? Not needed?

## Business (If Applicable)

- [ ] **Distribution** — How will users find this?
- [ ] **Monetization** — Is there a revenue model?
- [ ] **Cost structure** — Hosting, API costs, third-party service costs?
- [ ] **Analytics** — What metrics matter? What needs to be tracked?
