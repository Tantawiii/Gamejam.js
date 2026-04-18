/**
 * Tracks card-offer cycles for pity weighting. Wire into your card UI when it exists.
 * Rule: if a "new cart" card was not offered in 4+ cycles, add 5% to cart offer weight (stacks per block of 4).
 */
export class CardPityState {
  private cyclesSinceCartOffered = 0;

  /** Call once per card-offer cycle after you know whether a cart was in the pool. */
  recordCycle(cartWasOffered: boolean): void {
    if (cartWasOffered) {
      this.cyclesSinceCartOffered = 0;
    } else {
      this.cyclesSinceCartOffered += 1;
    }
  }

  /**
   * Extra probability weight for the cart card (e.g. add to base weight before normalization).
   * +0.05 per full 4 cycles without a cart offer.
   */
  getCartOfferWeightBonus(): number {
    const blocks = Math.floor(this.cyclesSinceCartOffered / 4);
    return blocks * 0.05;
  }

  reset(): void {
    this.cyclesSinceCartOffered = 0;
  }
}
