"""Test-session setup. Runs before any test module is imported.

Forces the live-timing background client off for the entire test run —
no test may open a real network connection to F1's feed. See
docs/superpowers/handoffs/2026-08-17-live-timing-signalr-context-transfer.md
§7 decision 8.
"""
import os

os.environ["LIVETIMING_AUTOSTART"] = "0"
