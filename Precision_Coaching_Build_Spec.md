# EQX Precision Coaching Dashboard

## Prototype Build Specification (V1)

> Purpose: Build a simple, executive-friendly prototype that
> demonstrates whether the Precision Coaching program is improving coach
> competency, daily behaviors, and business outcomes.

------------------------------------------------------------------------

# Vision

The dashboard is a performance compass---not a reporting tool.

It should answer four questions:

1.  Where did the coach start?
2.  Is the coach improving?
3.  What behaviors are driving improvement?
4.  What should happen next?

Every page should help leadership understand whether Precision Coaching
is creating better coaches and better business results.

------------------------------------------------------------------------

# Core Architecture

``` text
                    Coach ID
                        │
        ┌───────────────┼───────────────┐
        │               │               │
 Competency        Lead Tracker     Business KPIs
        │               │               │
        └───────────────┼───────────────┘
                        │
          Precision Coaching Dashboard
```

Coach ID is the primary key across all datasets.

------------------------------------------------------------------------

# Sources of Truth

## 1. Business KPIs

-   Active Clients
-   Completed Sessions
-   Pay Period
-   Monthly Sessions
-   Equifits Completed
-   CPTs Completed

## 2. Lead Tracker

-   Fitness Specialist
-   Club
-   Agree to Outreach
-   Client Type
-   Client Name
-   Client Email
-   Client Phone
-   Notes

## 3. Competency Assessment

-   Baseline
-   Midpoint
-   Final
-   Professionalism
-   Performance
-   Programming
-   Overall Competency Score

------------------------------------------------------------------------

# Navigation

1.  Overview
2.  Growth
3.  Behavior
4.  Coach

------------------------------------------------------------------------

# Page 1 --- Overview

Purpose: Executive summary of pilot health.

Display: - Coaches enrolled - Active Coaches - Average Competency -
Active Clients - Sessions - Equifits - CPTs - Leads Captured

Include: - Pilot KPI cards - Competency distribution - Club ranking -
Wins - Opportunities - Recommended Actions

------------------------------------------------------------------------

# Page 2 --- Growth

Purpose: Measure improvement over time.

Business Trends - Active Clients - Sessions - Equifits - CPTs - Pay
Period Trend - Monthly Trend

Competency Trends - Baseline vs Midpoint vs Final - Overall Improvement
% - Pillar Improvement - Competency Heat Map

Primary Question: Is this coach improving?

------------------------------------------------------------------------

# Page 3 --- Behavior

Purpose: Understand which activities create results.

Lead Funnel Lead → Contact → Appointment → Equifit → CPT → Active Client

Metrics - Leads Added - Outreach Approved - Follow Ups - Appointments -
Equifits - CPTs - Conversion % - Daily / Weekly / Monthly Activity

Primary Question: Are behaviors creating business outcomes?

------------------------------------------------------------------------

# Page 4 --- Coach

Purpose: Complete coach scorecard.

Sections \## Baseline Business snapshot Competency snapshot

## Growth

Business trend Competency trend

## Lead Activity

Lead funnel Activity timeline

## Coaching Intelligence

Strengths Growth Opportunities Recommended Next Steps

------------------------------------------------------------------------

# Dashboard Principles

-   Minimal clicks
-   Mobile responsive
-   Executive friendly
-   Clear hierarchy
-   No manual calculations
-   Objective metrics first
-   Action-oriented recommendations

------------------------------------------------------------------------

# Intelligence Rules

Examples:

High Activity + Low Conversion → Closing Skill Opportunity

Low Activity → Pipeline Development Opportunity

High Competency + Low Business Growth → Execution Opportunity

High Competency + High Business Growth → Best Practice Candidate

------------------------------------------------------------------------

# Success Criteria

Leadership should be able to answer within 60 seconds:

-   Where did this coach begin?
-   Is the coach improving?
-   Which behaviors changed?
-   Are business KPIs improving?
-   What coaching action should happen next?

------------------------------------------------------------------------

# Reuse from Previous Prototype

Keep: - EQX visual language - Responsive layout - KPI cards - Status
badges - Hierarchical filtering - Coach / Club / Pilot drilldowns

Improve: - Single scoring engine - Trend-first storytelling - Functional
drilldowns - Simpler navigation - Coach-centric architecture -
Integrated data model

------------------------------------------------------------------------

# Phase 1 Deliverables

-   UX wireframes
-   HTML prototype
-   Static sample dataset
-   KPI calculation engine
-   Recommendation engine
-   Mobile-responsive interface

This document serves as the foundation for the next-generation Precision
Coaching Dashboard prototype.
