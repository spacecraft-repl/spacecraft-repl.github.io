<!-- Insert SpaceCraft logo either above, below, or next to title -->
## SpaceCraft: A Real-Time, Collaborative REPL and Code Editor

## 1 Introduction
SpaceCraft is an open-source, real-time collaborative REPL (Read-Eval-Print-Loop) that allows users to write and execute code in the browser for Ruby, JavaScript, and Python. We built this project using Node and Docker, with clients and server communicating over WebSockets.

The major challenges we faced were creating and managing server-side processes for executing code in the selected language runtime, allowing multiple clients to collaborate on the same REPL, and building a framework for the security and resource usage of our project with Docker containers.

In this case study, we'll detail our journey in building this project, the strategies we imployed to synchronize collaborating clients in real-time, the security techniques we implemented to prevent malicious code, and our final networked solution. We'll explore the choices we made to efficiently transfer user input and evaluated output between the clients and server, reduce our latency, and balance our resource usage across containers.

## 1.1 High-Level Goals


## 2 Building a REPL


## 3 Utilizing Containers

### 3.1 Sementing Users by Container

### 3.2 Securing Containers

### 3.3 Managing Container Resources


## 4 Collaboration with Multiple Users

### 4.1 Connecting Multiple Users to the Same Container

### 4.2 Syncing Input and Output

### 4.3 Handling REPL Conflict Resolution


## 5 Optimizations


## 6 Future Work

### 6.1 Improve User Experiences

### 6.2 Support Low-Level Languages


## 7 About the Team
Our team of three software developers built SpaceCraft remotely, working together across the United States. Please feel free to contact us if you'd like to talk software engineering, containers, or the web. We're always open to learning about new opportunities.

<!-- Place our pictures here with names, titles, location, and link to personal websites. -->

## References
If you're interested in building your own REPL, learning about containers, or trying our WebSockets, we recommend checkout out the resources below. They have been invaluable to our research and development.

