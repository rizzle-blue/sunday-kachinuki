import { describe, expect, test } from "bun:test";
import {
  SIMULATION_KENSHI,
  createSundaySimulation,
  finalizeSimulationBout,
  formSundaySimulation,
  recordSimulationEvent,
  startSimulationBout,
  undoSimulationEvent,
} from "./sunday-simulator";

describe("Sunday host simulator", () => {
  test("prefills ten ready Kenshi into three complete teams and one waiting member", () => {
    const state = formSundaySimulation(createSundaySimulation());
    expect(SIMULATION_KENSHI).toHaveLength(10);
    expect(state.teams).toHaveLength(3);
    expect(state.teams.every((team) => team.members.length === 3)).toBe(true);
    expect(state.waiting).toHaveLength(1);
    expect(state.currentMatch?.bouts).toHaveLength(3);
  });

  test("records points, hansoku awards, and undo for the active bout", () => {
    let state = startSimulationBout(formSundaySimulation(createSundaySimulation()));
    state = recordSimulationEvent(state, { kind: "hansoku", side: "shiro" });
    state = recordSimulationEvent(state, { kind: "hansoku", side: "shiro" });
    expect(state.currentMatch?.bouts[0]?.aka.ippon).toBe(1);
    expect(state.currentMatch?.bouts[0]?.shiro.hansoku).toBe(2);
    state = undoSimulationEvent(state);
    expect(state.currentMatch?.bouts[0]?.aka.ippon).toBe(0);
    expect(state.currentMatch?.bouts[0]?.shiro.hansoku).toBe(1);
  });

  test("finalizes three bouts and produces a team winner", () => {
    let state = formSundaySimulation(createSundaySimulation());
    for (let boutIndex = 0; boutIndex < 3; boutIndex += 1) {
      state = startSimulationBout(state);
      state = recordSimulationEvent(state, { kind: "point", side: "aka", waza: "men" });
      state = recordSimulationEvent(state, { kind: "point", side: "aka", waza: "kote" });
      state = finalizeSimulationBout(state);
    }
    expect(state.phase).toBe("completed");
    expect(state.winner).toBe("aka");
    expect(state.currentMatch?.state).toBe("final");
  });
});
