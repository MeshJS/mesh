import Button from "~/components/button/button";
import Link from "~/components/link";
import { AboutSection } from "../";

export default function AboutMeeting() {
  return (
    <AboutSection
      title="Planning and Open Office"
      description="We meet every week to discuss the progress of the project and plan the next steps every Tuesday at 1400UTC, where we welcome anyone to join us and ask questions."
    >
      <>
        <Link href="https://calendar.google.com/calendar/u/0?cid=MmJiNzE0ODRmNjBhZTgyOWZiYTE4MDFjZDlmZTM1N2UwODc5MjlkYmU4Y2U4NGRmYjc3OTgzZjdiODRiZTUxMUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t">
          <Button>Subscribe to Calendar</Button>
        </Link>
      </>
    </AboutSection>
  );
}
