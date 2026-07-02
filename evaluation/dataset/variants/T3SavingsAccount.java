import java.util.ArrayList;
import java.util.List;

public class T3SavingsAccount {

    private final String holderName;
    private long amountCents;
    private final List<String> history = new ArrayList<>();
    private int operationCount = 0;

    public T3SavingsAccount(String holderName, long initialCents) {
        if (initialCents < 0) {
            throw new IllegalArgumentException("initial amount cannot be negative");
        }
        this.holderName = holderName;
        this.amountCents = initialCents;
    }

    public void credit(long cents) {
        if (cents <= 0) {
            throw new IllegalArgumentException("credit must be positive");
        }
        amountCents += cents;
        operationCount++;
        history.add("CREDIT " + cents);
    }

    public void debit(long cents) {
        if (cents <= 0) {
            throw new IllegalArgumentException("debit must be positive");
        }
        if (cents > amountCents) {
            throw new IllegalStateException("balance too low");
        }
        amountCents -= cents;
        operationCount++;
        history.add("DEBIT " + cents);
    }

    public long currentBalance() {
        return amountCents;
    }

    public int operations() {
        return operationCount;
    }
}
