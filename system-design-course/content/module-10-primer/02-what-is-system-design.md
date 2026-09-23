# What Is System Design?

> **Lesson 10.2** · All levels · 15 min

---

System design is the process of defining the architecture, components, modules, interfaces, and data for a system to satisfy specified requirements. It is essentially creating a blueprint for a complex software system to ensure it is efficient, reliable, and scalable.

System design is the art of making technical trade-offs to turn a vague problem into a scalable solution. It is not just about connecting boxes; it is about justifying why you connected them that way based on constraints.


## System Design vs Object-Oriented Design

System design interviews differ fundamentally from object-oriented design.

| Aspect | Object-Oriented Design | System Design |
|---|---|---|
| Example Problems | Design a parking lot, elevator controller, chess game, vending machine | Design Twitter, YouTube, Uber, Netflix |
| Scale | Single machine | Large scale, millions of users, petabytes of data, multiple data centers |
| Focus | Code structure, class relationships, design patterns | Architecture, distributed systems, scalability |
| Skills Tested | Class design, inheritance, interfaces, SOLID principles | Component selection, data flow, partitioning, replication, trade-offs |
| Output | UML diagrams, code implementation, class hierarchies | Architecture diagrams, capacity estimates, API design, database schemas |
| Execution | Code runs on single process | Services span multiple servers and regions |

The skills overlap but the emphasis differs. Object-oriented design emphasizes clean code and maintainability. System design emphasizes performance, reliability, and cost at scale.

---
