# DM Team — Claude Skills

Shared prompt library for the NORAM Deal Management team. Each skill is a ready-to-use Claude prompt. Copy the relevant skill into Claude (claude.ai or Slack's Claude integration), paste your deal data, and get an instant output.

## Available Skills

| Skill | What it does | When to use it |
|---|---|---|
| [1-pipeline-pulse.md](1-pipeline-pulse.md) | Generates the weekly "where the deals are" digest | Every Monday before the team standup |
| [2-deal-synopsis.md](2-deal-synopsis.md) | Summarises an email thread: what's outstanding, who holds the pen, what's next | Before escalating or adding a senior stakeholder to a thread |
| [3-chase-email.md](3-chase-email.md) | Writes a professionally framed chase email to a client or internal team | Any deal with an open loop and no response |
| [4-pre-submission-check.md](4-pre-submission-check.md) | Reviews MAF/deal details before submission to catch errors before UW does | Before every MAF submission |
| [5-escalation-brief.md](5-escalation-brief.md) | Produces a one-page deal brief for senior stakeholder escalation | Before raising to Zack or any exec |

## How to use in Slack

1. Open Slackbot and start a conversation with Claude
2. Paste the skill prompt (everything between the `---` markers)
3. Then paste your deal data below it
4. Hit send

## How to use in claude.ai

1. Open a new Claude conversation
2. Paste the skill prompt, then your deal data
3. For recurring use, save it as a Project with the skill as the system prompt
