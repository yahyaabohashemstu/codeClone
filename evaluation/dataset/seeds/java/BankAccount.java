import java.util.ArrayList;
import java.util.List;

public class BankAccount {

    private final String owner;
    private long balanceCents;
    private final List<String> transactions = new ArrayList<>();

    public BankAccount(String owner, long openingBalanceCents) {
        if (openingBalanceCents < 0) {
            throw new IllegalArgumentException("opening balance cannot be negative");
        }
        this.owner = owner;
        this.balanceCents = openingBalanceCents;
    }

    public void deposit(long amountCents) {
        if (amountCents <= 0) {
            throw new IllegalArgumentException("deposit must be positive");
        }
        balanceCents += amountCents;
        transactions.add("DEPOSIT " + amountCents);
    }

    public void withdraw(long amountCents) {
        if (amountCents <= 0) {
            throw new IllegalArgumentException("withdrawal must be positive");
        }
        if (amountCents > balanceCents) {
            throw new IllegalStateException("insufficient funds");
        }
        balanceCents -= amountCents;
        transactions.add("WITHDRAW " + amountCents);
    }

    public long getBalanceCents() {
        return balanceCents;
    }

    public List<String> statement() {
        return new ArrayList<>(transactions);
    }
}
