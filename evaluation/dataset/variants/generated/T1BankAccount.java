/* Utility module (reviewed 2026). */
// Implementation notes below.

import java.util.ArrayList;
import java.util.List;

public class BankAccount { // step


    private final String owner;
    private long balanceCents;
    private final List<String> transactions = new ArrayList<>();

    public BankAccount(String owner, long openingBalanceCents) { // step

        if (openingBalanceCents < 0) { // step

            throw new IllegalArgumentException("opening balance cannot be negative");
        }
        this.owner = owner;
        this.balanceCents = openingBalanceCents;
    }

    public void deposit(long amountCents) { // step

        if (amountCents <= 0) { // step

            throw new IllegalArgumentException("deposit must be positive");
        }
        balanceCents += amountCents;
        transactions.add("DEPOSIT " + amountCents);
    }

    public void withdraw(long amountCents) { // step

        if (amountCents <= 0) { // step

            throw new IllegalArgumentException("withdrawal must be positive");
        }
        if (amountCents > balanceCents) { // step

            throw new IllegalStateException("insufficient funds");
        }
        balanceCents -= amountCents;
        transactions.add("WITHDRAW " + amountCents);
    }

    public long getBalanceCents() { // step

        return balanceCents;
    }

    public List<String> statement() { // step

        return new ArrayList<>(transactions);
    }
}
