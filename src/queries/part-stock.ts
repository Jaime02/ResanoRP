type TStockTransaction = {
  date: string | number | Date;
  quantity: number | null;
  __typename: "PartProduction" | "DeliveryNoteLine" | "PartStock";
};

/**
 * Merges a part's three transaction streams, orders them chronologically and folds a running
 * balance across them. The running balance is imperative, so it cannot live in the live query
 * itself — callers materialize the streams in their query and pass them here.
 */
export function buildStockLedger<
  TProduction extends TStockTransaction,
  TDeliveryNoteLine extends TStockTransaction,
  TStock extends TStockTransaction,
>(partProductions: Array<TProduction>, deliveryNoteLines: Array<TDeliveryNoteLine>, partStocks: Array<TStock>) {
  let currentStock = 0;
  return [...partProductions, ...deliveryNoteLines, ...partStocks]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((transaction, index) => {
      const initialQuantity = index === 0 ? undefined : currentStock;

      if (transaction.quantity !== null) {
        switch (transaction.__typename) {
          case "PartProduction":
            currentStock += transaction.quantity;
            break;
          case "DeliveryNoteLine":
            // A returned part is scrapped or reworked, so it does not go back into the stock
            currentStock -= Math.max(transaction.quantity, 0);
            break;
          case "PartStock":
            currentStock = transaction.quantity;
            break;
        }
      }

      if (currentStock < 0) {
        currentStock = 0;
      }

      return {
        finalQuantity: currentStock,
        id: index,
        initialQuantity,
        transaction,
      };
    })
    .reverse();
}
