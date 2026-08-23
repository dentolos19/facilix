# Facilix

## Overview

Facilix is a smart facility monitoring and operations platform designed for a modern food factory environment. The project focuses on helping facility managers, security staff, and tenants manage daily operations more safely, efficiently, and intelligently.

The system is intended for Harrison Food Factory, a new food factory expected to be ready in 2027. The goal is to showcase how smarter monitoring, automation, and real-time visibility can improve the way industrial food facilities operate.

Facilix helps reduce manual monitoring, improve security awareness, support hygiene and compliance checks, manage loading bay activity, and give staff a clearer view of what is happening across the factory.

## Problem Statement

Food factories require constant monitoring across many areas, including entry points, restricted zones, food operation areas, loading bays, parking spaces, and tenant facilities. These areas are often monitored manually by security staff and facility management teams.

Manual monitoring creates several challenges:

- Staff need to watch multiple areas at the same time.
- Security incidents may be missed or detected late.
- Hygiene and compliance issues may not be spotted quickly.
- Loading bays can become congested during peak hours.
- Tenants and drivers may face delays due to poor visibility.
- Facility staff spend too much time on repetitive monitoring tasks.
- Operational errors can increase as the facility becomes busier.

Facilix aims to solve these problems by giving staff a centralized way to monitor the factory, receive alerts, understand incidents, and respond quickly.

## Target Users

### Facility Management Staff

Facility management staff are responsible for the overall operation of the factory. They need visibility over security, tenant activity, parking, loading bays, compliance, and daily operations.

### Security Personnel

Security staff are responsible for monitoring entry and exit points, responding to incidents, checking unauthorized access, and ensuring that restricted zones are protected.

### Tenants

Tenants rely on smooth factory operations for deliveries, logistics, cold-chain activities, and daily business operations. They benefit from fewer delays, better coordination, and safer facilities.

### Drivers and Delivery Partners

Drivers need better visibility on loading bay availability so they can plan their trips and avoid unnecessary waiting during peak hours.

## Product Goals

The main goals of Facilix are:

- Reduce the amount of manual monitoring required across the factory.
- Improve security and access awareness across different factory zones.
- Help detect hygiene, pest, and compliance risks earlier.
- Improve loading bay visibility and reduce congestion.
- Help facility staff respond faster to incidents.
- Give management a clear overview of factory operations.
- Improve tenant satisfaction by reducing delays and operational issues.
- Make Harrison Food Factory stand out as a modern, smart, and AI-enabled food factory.

## Key Product Requirements

## 1. Factory Zone Monitoring

Facilix should divide the factory into clear operational zones. Each zone should have a visible status so staff can quickly understand whether the area is operating normally or requires attention.

The system should support zones such as:

- Reception
- Entry and exit points
- PPE checkpoint
- Food operations area
- Cold storage
- Loading bay
- Parking area
- Tenant areas
- Security office
- Restricted areas

Each zone should be able to show whether it is normal, under warning, experiencing a breach, or locked down.

## 2. Access Control and Movement Tracking

Facilix should help monitor who is entering and moving through different factory zones.

The system should support:

- Tracking movement between zones.
- Recording access events.
- Highlighting unauthorized access attempts.
- Identifying suspicious movement patterns.
- Supporting stricter access for sensitive food operation areas.
- Helping staff understand where a person entered, moved, and triggered an alert.

The factory should be designed so that sensitive food operation zones have stricter entry requirements, especially areas that require PPE.

## 3. Security Monitoring

Facilix should help security staff monitor the factory more effectively without relying only on a fixed security room.

The system should support:

- Real-time security alerts.
- Intruder detection alerts.
- Unauthorized access alerts.
- Tailgating or suspicious entry alerts.
- Zone breach alerts.
- Lockdown status for affected zones.
- A clear incident timeline for security events.

Security staff should be able to view important alerts and factory status while moving around the facility.

## 4. PPE and Compliance Monitoring

Facilix should help monitor whether people in required areas are following PPE and compliance rules.

The system should support:

- Detecting missing or incorrect PPE.
- Highlighting compliance risks in food operation zones.
- Showing where PPE violations happened.
- Alerting staff when immediate action is needed.
- Recording incidents for later review.

This is especially important in food manufacturing areas where hygiene and safety standards must be maintained.

## 5. Hygiene and Pest Monitoring

Facilix should help detect hygiene-related risks early.

The system should support:

- Pest detection alerts.
- Insect or rodent anomaly alerts.
- Hygiene risk alerts in food operation areas.
- Follow-up tracking for hygiene incidents.
- A hygiene-focused dashboard view for staff.

The goal is to reduce the chance of food safety issues and help staff respond quickly before small issues become serious.

## 6. Loading Bay and Logistics Monitoring

Facilix should help manage loading bay usage and reduce delivery congestion.

The system should support:

- Showing whether each loading bay is occupied or available.
- Displaying loading bay activity in real time.
- Helping drivers and tenants understand expected availability.
- Recording delivery activity.
- Highlighting peak-hour congestion.
- Reducing the need for staff to manually monitor traffic.

Since the factory has 2 loading bays, visibility and planning are important to prevent unnecessary delays.

## 7. CCTV Intelligence Plugins

Facilix should support configurable, outcome-oriented intelligence plugins for CCTV video analysis. Plugins should describe an operational job that facility staff recognize rather than exposing underlying AI capabilities such as generic person, vehicle, object, or natural-language detection.

Each CCTV device can have multiple plugins enabled. Every plugin uses a vision model. The configured object model is the default when a plugin does not require the vehicle model.

Plugins that share the same vision model must reuse one inference pass for each CCTV segment. The result is filtered per plugin after inference to avoid duplicate processing cost.

Plugins that additionally use a vision-language model must provide both the original frame and its vision-annotated frame as analysis context. The original frame remains the source of truth; annotations are treated as location hints.

### Plugin Types

**Restricted Area Protection** — Protects sensitive areas by detecting unexpected people, entry transitions, and occupancy breaches.

**PPE Compliance** — Reviews food-operation footage for visible missing or incorrectly worn protective equipment.

**Loading Bay Operations** — Tracks vehicle arrivals, departures, bay occupancy, and possible congestion.

**Hygiene & Pest Watch** — Reviews food-sensitive areas for visible pests, spills, standing water, and waste risks.

**Workplace Safety** — Reviews operational areas for falls, blocked access, unsafe crowding, and dangerous person–vehicle proximity.

### Alert Rules

Plugins provide practical default policies that staff can adjust:

- **Presence and Occupancy** — Alert when a relevant person or vehicle appears or exceeds an operational limit.
- **Arrival and Departure** — Record transitions such as a vehicle arriving at or leaving a loading bay.
- **Compliance Review** — Alert when visible PPE or hygiene conditions violate the configured policy.
- **Safety Review** — Alert when a clearly visible safety scenario matches a configured rule.
- **Operational State** — Project plugin results into states such as clear, breach, available, occupied, normal, or attention.

### Configuration

- Enable or disable each plugin per camera.
- Select the operational policy and editable alert rules.
- Configure minimum confidence where object detection is used.
- Configure alert severity and a cooldown that is enforced during processing.
- Show supporting detections or scene evidence on recorded CCTV playback.
- Allow staff to select an individual plugin in the Predictions tab and review only that plugin's detections.
- Do not expose or execute the removed People Detection, Vehicle Detection, Object Detection, or Natural Language legacy plugins.

## 8. Dashboard and Operational Visibility

Facilix should provide a clear dashboard that gives staff a complete view of factory operations.

The dashboard should be separated into key sections:

- General
- Security
- Hygiene
- Loading Bay
- Cameras
- Alerts
- Settings

The dashboard should show:

- Overall factory status.
- Active alerts.
- Zone status.
- Loading bay availability.
- Hygiene and compliance alerts.
- Security incidents.
- Recent activity.
- Incident history.
- Key operational trends.

The dashboard should be easy to understand, even during stressful situations.

## 8. Factory Map View

Facilix should include a visual map of the factory.

The map should allow staff to:

- View different factory zones.
- See which areas are normal, under warning, breached, or locked down.
- Select zones to view more details.
- Identify where alerts are happening.
- Understand the layout of cameras, loading bays, and restricted areas.

The map should feel like a professional facility monitoring interface, inspired by security camera map layouts, but designed for a real industrial environment.

## 9. Incident Alerts and Response

Facilix should help staff understand and respond to incidents quickly.

Each alert should clearly show:

- What happened.
- Where it happened.
- When it happened.
- How serious it is.
- What action should be taken.
- Whether the issue is new, acknowledged, in progress, or resolved.
- Available source video and annotated image evidence for actionable CCTV intelligence alerts.
- The measured values, rule, confidence, and visible evidence that explain why the alert was raised.

In the global event list, selecting one event should show only that event's evidence and details. Selecting the source device should show the device details and all events from that device. A double-click on an event is the shortcut for selecting its source device.

The system should help reduce confusion and make incident response faster and more organized.

## 10. Reporting and Review

Facilix should help management review past activity and identify operational problems.

The system should support:

- Incident history.
- Compliance records.
- Loading bay usage trends.
- Security event summaries.
- Hygiene-related incident records.
- Operational performance summaries.

This helps management understand recurring issues and improve factory operations over time.

## Expected Outcomes

Facilix should help achieve the following outcomes:

- Reduce manual monitoring workload by 50–70%.
- Reduce manpower required for routine monitoring by around 40%.
- Reduce manual environmental, hygiene, and compliance checking by around 50%.
- Improve loading bay and parking usage by 20–30%.
- Reduce security risks and unauthorized access incidents.
- Reduce hygiene and compliance risks.
- Improve tenant satisfaction through smoother operations.
- Reduce delays during deliveries and peak-hour loading bay usage.
- Help staff focus on higher-value operational work.
- Position Harrison Food Factory as a modern smart food factory.

## Product Success Criteria

The project can be considered successful if:

- Facility staff can clearly monitor the factory from one dashboard.
- Security staff can respond to incidents faster.
- Loading bay usage becomes easier to understand and manage.
- Hygiene and compliance risks are easier to detect.
- Tenants experience fewer delays and smoother operations.
- Management can clearly see the value of smarter facility monitoring.
- The system demonstrates how AI can improve food factory operations in a practical and understandable way.

## Product Vision

Facilix aims to become a smart command center for modern food factories.

Instead of relying heavily on manual observation and disconnected systems, Facilix gives facility teams a clearer, faster, and more organized way to manage factory operations.

The long-term vision is to make food factories safer, cleaner, more efficient, and easier to operate at scale.
