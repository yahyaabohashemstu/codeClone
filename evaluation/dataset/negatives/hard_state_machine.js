class StateMachine {
  constructor(initialState, transitions) {
    this.state = initialState;
    this.transitions = new Map(Object.entries(transitions));
    this.history = [initialState];
  }

  can(action) {
    const allowed = this.transitions.get(this.state);
    return Boolean(allowed && Object.prototype.hasOwnProperty.call(allowed, action));
  }

  fire(action) {
    if (!this.can(action)) {
      throw new Error(`invalid transition "${action}" from "${this.state}"`);
    }
    const nextState = this.transitions.get(this.state)[action];
    this.state = nextState;
    this.history.push(nextState);
    return nextState;
  }

  reset() {
    const initial = this.history[0];
    this.state = initial;
    this.history = [initial];
  }

  visited(stateName) {
    return this.history.includes(stateName);
  }
}

module.exports = StateMachine;
