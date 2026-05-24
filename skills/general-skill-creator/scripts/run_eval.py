#!/usr/bin/env python3
"""Evaluate recorded trigger results for a portable skill.

The active coding agent should run trigger prompts through its native skill
discovery path, then save observed results. This wrapper scores those recorded
results using the generic trigger scoring utility.
"""

import sys

from scripts.score_trigger_results import main


if __name__ == "__main__":
    sys.exit(main())
