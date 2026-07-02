import java.util.ArrayList;
import java.util.List;

public class T2LedgerAccount {

    private final String holder;
    private long cents;
    private final List<String> entries = new ArrayList<>();

    public T2LedgerAccount(String holder, long startCents) {
        if (startCents < 0) {
            throw new IllegalArgumentException("opening balance cannot be negative");
        }
        this.holder = holder;
        this.cents = startCents;
    }

    public void addFunds(long delta) {
        if (delta <= 0) {
            throw new IllegalArgumentException("addFunds must be positive");
        }
        cents += delta;
        entries.add("DEPOSIT " + delta);
    }

    public void removeFunds(long delta) {
        if (delta <= 0) {
            throw new IllegalArgumentException("withdrawal must be positive");
        }
        if (delta > cents) {
            throw new IllegalStateException("insufficient funds");
        }
        cents -= delta;
        entries.add("WITHDRAW " + delta);
    }

    public long balance() {
        return cents;
    }

    public List<String> entriesCopy() {
        return new ArrayList<>(entries);
    }
}
