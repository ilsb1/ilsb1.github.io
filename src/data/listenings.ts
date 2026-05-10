export type Track = { title: string; file: string };

export const units: Record<number, Track[]> = {
  // New curriculum Unit 1 uses internal ID 0 to preserve legacy QR paths.
  0: [{ title: "Helping a Tourist in Baku", file: "/listenings/listening0.mp3" }],
  1: [{ title: "MindTalk Radio: Who We Are and Who We Admire", file: "/listenings/listening1.mp3" }],
  2: [{ title: "Academic Success Seminar: Learning Styles & Study Strategies", file: "/listenings/listening2.mp3" }],
  3: [{ title: "Future Tech Café Chat", file: "/listenings/listening3.mp3" }],
  4: [{ title: "The Characters in Famous Paintings", file: "/listenings/listening4.mp3" }],
  5: [{ title: "Don't Judge a Book by Its Film", file: "/listenings/listening5.mp3" }],
  6: [{ title: "Student Voices: Fashion, Trends & Online Shopping", file: "/listenings/listening6.mp3" }],
  7: [{ title: "Healthy Choices for Student Life", file: "/listenings/listening7.mp3" }],

  // Unit 8 has multiple:
  8: [
    { title: "Budget vs Luxury Travel: A Tale of Two Trips", file: "/listenings/listening8(b).mp3" },
    { title: "Travel Agency Advertisement: Thailand Discovery Tour", file: "/listenings/listening8(ad1).mp3" },
    { title: "Travel Agency Advertisement: Swiss Panorama by Train", file: "/listenings/listening8(ad2).mp3" },
    { title: "Travel Agency Advertisement: Greek Island Cruise", file: "/listenings/listening8(ad3).mp3" },
  ],

  9: [{ title: "International Weather Forecast", file: "/listenings/listening9.mp3" }],
  10: [{ title: "Environmental Challenges & Renewable Solutions", file: "/listenings/listening10.mp3" }],
  12: [{ title: "A Future in Teaching — City or Rural School?", file: "/listenings/listening12.mp3" }],
};

export const unitNumbers = Object.keys(units).map(Number).sort((a, b) => a - b);

const displayUnitToInternalUnit = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12] as const;
const internalToDisplayUnit = new Map<number, number>(
  displayUnitToInternalUnit.map((internalUnitId, index) => [internalUnitId, index + 1])
);

export type DisplayUnit = {
  displayUnitNumber: number;
  internalUnitId: number;
};

export const displayUnits: DisplayUnit[] = displayUnitToInternalUnit.map((internalUnitId, index) => ({
  displayUnitNumber: index + 1,
  internalUnitId,
}));

export const getDisplayUnitNumber = (internalUnitId: number): number =>
  internalToDisplayUnit.get(internalUnitId) ?? internalUnitId;
